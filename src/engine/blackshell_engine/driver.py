"""Engine driver — parse argv, dispatch commands, assemble the pipeline
(docs/interfaces/02-driver.md). Single source of truth for the command set.

Pipeline order is fixed: load -> gate (reject => exit 2) -> noising L1->L2->L3
(only the unit's selected levels) -> emit. Every stage honours the same IR
contract, so dummy passes swap for real ones without changes here.

Error handling: pipeline code raises messages.EngineError; the driver is the
ONLY place that renders a message or touches stdout/stderr, via `_emit`, which
looks the text/stream/exit up in the single-source catalog (messages.py).
"""

import json
import os
import sys

from . import harness, ir, messages, stage
from .messages import EXIT_OK, EngineError
from .passes import GATE, LEVEL_ORDER, NOISING

USAGE = """blackshell <command> [options]

Product commands:
  check <ir-file>              Gate-only verdict (§5 cond.1); preview before add
  add   <ir-file> [--level L]  Stage a unit for sealing (L = e.g. L1,L2,L3)
  drop  <ir-file>              Unstage a unit
  list                         Show staged units and their levels
  enshell [--no-gate] [--emit-ir DIR] [--verify]
                               Seal all staged units -> artifacts

Dev commands:
  run   <ir-file> [--input k=v ...]   Run a unit in the toy interpreter
  help                         Show this help
"""


def main(argv):
    if not argv:
        print(USAGE)
        return EXIT_OK

    cmd, rest = argv[0], argv[1:]
    try:
        handler = {
            "help": lambda r: (print(USAGE), EXIT_OK)[1],
            "check": _check,
            "add": _add,
            "drop": _drop,
            "list": _list,
            "enshell": _enshell,
            "run": _run,
        }.get(cmd)
        if handler is None:
            code = _emit("cmd.unknown", cmd=cmd)
            print(USAGE, file=sys.stderr)
            return code
        return handler(rest)
    except EngineError as e:
        # The one place pipeline-raised messages are rendered.
        return _emit(e.key, **e.params)


# --- commands ---------------------------------------------------------------


def _check(rest):
    path = _one_positional(rest)
    verdict = _run_gate(ir.load_ir(path))
    if verdict["ok"]:
        return _emit("check.pass", path=path, gate=GATE[0])
    return _emit("gate.reject", path=path, reason=verdict.get("reason", "ineligible"))


def _add(rest):
    levels, rest = _pop_opt(rest, "--level")
    path = _one_positional(rest)
    ir.load_ir(path)  # validate before staging
    selected = _parse_levels(levels)
    stage.add(path, selected)
    return _emit("stage.added", path=path, levels=_show_levels(selected))


def _drop(rest):
    path = _one_positional(rest)
    if stage.drop(path):
        return _emit("stage.dropped", path=path)
    return _emit("stage.not_staged", path=path)


def _list(rest):
    units = stage.staged()
    if not units:
        return _emit("stage.nothing")
    for u in units:
        _emit("stage.list_item", path=u["path"], levels=_show_levels(u["levels"]))
    return EXIT_OK


def _enshell(rest):
    no_gate, rest = _pop_flag(rest, "--no-gate")
    do_verify, rest = _pop_flag(rest, "--verify")
    emit_dir, rest = _pop_opt(rest, "--emit-ir")
    emit_dir = emit_dir or "."

    units = stage.staged()
    if not units:
        return _emit("stage.nothing")

    count = 0
    for u in units:
        path, levels = u["path"], u["levels"]
        module = ir.load_ir(path)
        baseline = ir.load_ir(path)  # independent L0 copy for the harness

        if not no_gate:
            verdict = _run_gate(module)
            if not verdict["ok"]:
                return _emit(
                    "gate.reject", path=path, reason=verdict.get("reason", "ineligible")
                )

        for level in LEVEL_ORDER:
            if level not in levels:
                continue
            name, transform = NOISING[level]
            module = transform(module)
            if do_verify:
                report = harness.verify(
                    baseline, module, harness.sample_inputs(baseline)
                )
                if not report["equivalent"]:
                    return _emit(
                        "verify.broken",
                        pass_name=name,
                        path=path,
                        mismatch=report["mismatches"][0],
                    )

        out = _write_artifact(module, emit_dir)
        _emit("enshell.sealed", path=path, out=out)
        count += 1

    stage.clear()  # 1-shot artifact model: staging is consumed by enshell
    return _emit("enshell.done", count=count)


def _run(rest):
    inputs, rest = _pop_inputs(rest)
    path = _one_positional(rest)
    from .interp import run as interp_run

    # Interpreter outputs are data, not protocol messages — printed directly.
    for name, value in interp_run(ir.load_ir(path), inputs).items():
        print(f"{name}={value}")
    return EXIT_OK


# --- rendering (the single I/O point) ---------------------------------------


def _emit(key, **params):
    """Render one catalog message to the right stream; return its exit code.
    The only function in the engine that writes user-facing output."""
    line, stream, code = messages.render(key, **params)
    print(line, file=sys.stderr if stream == messages.ERR else sys.stdout)
    return code


# --- helpers ----------------------------------------------------------------


def _run_gate(module):
    _name, check = GATE
    return check(module)


def _write_artifact(module, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{module['name']}.sealed.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(module, f, indent=2)
        f.write("\n")
    return out


def _show_levels(levels):
    return ",".join(levels) if levels else "L0 (identity)"


def _parse_levels(raw):
    if not raw:
        return []
    return [tok.strip() for tok in raw.split(",") if tok.strip()]


def _one_positional(rest):
    positionals = [a for a in rest if not a.startswith("--")]
    if len(positionals) != 1:
        raise EngineError("arg.one_positional")
    return positionals[0]


def _pop_opt(rest, name):
    """Remove `--name value` and return (value, remaining)."""
    if name in rest:
        i = rest.index(name)
        value = rest[i + 1] if i + 1 < len(rest) else None
        return value, rest[:i] + rest[i + 2 :]
    return None, rest


def _pop_flag(rest, name):
    if name in rest:
        return True, [a for a in rest if a != name]
    return False, rest


def _pop_inputs(rest):
    """Collect `--input k=v ...` pairs (consumes k=v tokens after --input)."""
    inputs = {}
    if "--input" not in rest:
        return inputs, rest
    i = rest.index("--input")
    out = rest[:i]
    j = i + 1
    while j < len(rest) and "=" in rest[j] and not rest[j].startswith("--"):
        key, val = rest[j].split("=", 1)
        inputs[key] = int(val)
        j += 1
    out += rest[j:]
    return inputs, out
