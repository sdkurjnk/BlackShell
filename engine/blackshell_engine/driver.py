"""Engine driver — parse argv, dispatch commands, assemble the pipeline
(docs/interfaces/02-driver.md). Single source of truth for the command set.

Pipeline order is fixed: load -> gate (reject => exit 2) -> noising L1->L2->L3
(only the unit's selected levels) -> emit. Every stage honours the same IR
contract, so dummy passes swap for real ones without changes here.
"""

import os
import sys

from . import harness, ir, stage
from .passes import GATE, LEVEL_ORDER, NOISING

EXIT_OK = 0
EXIT_ERR = 1
EXIT_REJECT = 2  # gate rejected a unit (§5 condition 1)

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
            print(f"Unknown command: {cmd}", file=sys.stderr)
            print(USAGE, file=sys.stderr)
            return EXIT_ERR
        return handler(rest)
    except ir.IRError as e:
        print(f"error: {e}", file=sys.stderr)
        return EXIT_ERR
    except FileNotFoundError as e:
        print(f"error: file not found: {e.filename}", file=sys.stderr)
        return EXIT_ERR


# --- commands ---------------------------------------------------------------


def _check(rest):
    path = _one_positional(rest)
    module = ir.load_ir(path)
    verdict = _run_gate(module)
    if verdict["ok"]:
        print(f"pass: {path} is eligible (gate: {GATE[0]})")
        return EXIT_OK
    print(f"reject: {path} — {verdict.get('reason', 'ineligible')}", file=sys.stderr)
    return EXIT_REJECT


def _add(rest):
    levels, rest = _pop_opt(rest, "--level")
    path = _one_positional(rest)
    ir.load_ir(path)  # validate before staging
    selected = _parse_levels(levels)
    stage.add(path, selected)
    shown = ",".join(selected) if selected else "L0 (identity)"
    print(f"staged: {path} [{shown}]")
    return EXIT_OK


def _drop(rest):
    path = _one_positional(rest)
    if stage.drop(path):
        print(f"dropped: {path}")
    else:
        print(f"not staged: {path}", file=sys.stderr)
        return EXIT_ERR
    return EXIT_OK


def _list(rest):
    units = stage.staged()
    if not units:
        print("nothing staged")
        return EXIT_OK
    for u in units:
        shown = ",".join(u["levels"]) if u["levels"] else "L0 (identity)"
        print(f"  {u['path']} [{shown}]")
    return EXIT_OK


def _enshell(rest):
    no_gate, rest = _pop_flag(rest, "--no-gate")
    do_verify, rest = _pop_flag(rest, "--verify")
    emit_dir, rest = _pop_opt(rest, "--emit-ir")
    emit_dir = emit_dir or "."

    units = stage.staged()
    if not units:
        print("nothing staged")
        return EXIT_OK

    artifacts = []
    for u in units:
        path, levels = u["path"], u["levels"]
        module = ir.load_ir(path)
        baseline = ir.load_ir(path)  # independent L0 copy for the harness

        if not no_gate:
            verdict = _run_gate(module)
            if not verdict["ok"]:
                print(
                    f"reject: {path} — {verdict.get('reason', 'ineligible')}",
                    file=sys.stderr,
                )
                return EXIT_REJECT

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
                    print(
                        f"error: {name} broke equivalence on {path}: "
                        f"{report['mismatches'][0]}",
                        file=sys.stderr,
                    )
                    return EXIT_ERR

        out = _emit(module, emit_dir)
        artifacts.append(out)
        print(f"sealed: {path} -> {out}")

    stage.clear()  # 1-shot artifact model: staging is consumed by enshell
    print(f"enshell complete: {len(artifacts)} unit(s); staging cleared")
    return EXIT_OK


def _run(rest):
    inputs, rest = _pop_inputs(rest)
    path = _one_positional(rest)
    from .interp import run as interp_run

    result = interp_run(ir.load_ir(path), inputs)
    for name, value in result.items():
        print(f"{name}={value}")
    return EXIT_OK


# --- helpers ----------------------------------------------------------------


def _run_gate(module):
    _name, check = GATE
    return check(module)


def _emit(module, out_dir):
    import json

    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{module['name']}.sealed.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(module, f, indent=2)
        f.write("\n")
    return out


def _parse_levels(raw):
    if not raw:
        return []
    return [tok.strip() for tok in raw.split(",") if tok.strip()]


def _one_positional(rest):
    positionals = [a for a in rest if not a.startswith("--")]
    if len(positionals) != 1:
        raise ir.IRError("expected exactly one <ir-file> argument")
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
