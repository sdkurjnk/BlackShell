"""Single source of truth for user-facing messages and the exit-code protocol
(docs/interfaces/02-driver.md).

Pipeline code (ir / interp / passes) never prints — it raises
``EngineError(key, **params)``. The driver is the only place that renders a
message (``driver._emit``), looking everything up here. Keeping the whole
catalog in one module is what lets a future JS-side CLI take over rendering by
consuming this table, instead of the driver.
"""

EXIT_OK = 0
EXIT_ERR = 1
EXIT_REJECT = 2  # gate rejected a unit (§5 condition 1)
EXIT_ENGINE_MISSING = 127  # set by the JS launcher; listed here for completeness

OUT, ERR = "out", "err"

# key -> (template, stream, exit_code)
CATALOG = {
    # --- errors (stderr, exit 1) ---
    "ir.missing_field": ("error: IR missing field: {field}", ERR, EXIT_ERR),
    "ir.no_blocks": ("error: module has no blocks", ERR, EXIT_ERR),
    "ir.block_no_insts": ("error: block {label!r} has no insts", ERR, EXIT_ERR),
    "ir.inst_no_op": ("error: instruction without op in block {label!r}", ERR, EXIT_ERR),
    "ir.bad_branch": ("error: branch to unknown label in block {label!r}", ERR, EXIT_ERR),
    "ir.bad_json": ("error: invalid JSON in {path}: {detail}", ERR, EXIT_ERR),
    "file.not_found": ("error: file not found: {path}", ERR, EXIT_ERR),
    "arg.one_positional": ("error: expected exactly one <ir-file> argument", ERR, EXIT_ERR),
    "interp.missing_input": ("error: missing input: {param}", ERR, EXIT_ERR),
    "interp.step_limit": ("error: interpreter step limit exceeded (infinite loop?)", ERR, EXIT_ERR),
    "interp.unknown_op": ("error: unknown op: {op}", ERR, EXIT_ERR),
    "cmd.unknown": ("error: unknown command: {cmd}", ERR, EXIT_ERR),
    "stage.not_staged": ("error: not staged: {path}", ERR, EXIT_ERR),
    "verify.broken": ("error: {pass_name} broke equivalence on {path}: {mismatch}", ERR, EXIT_ERR),
    # --- reject (stderr, exit 2) ---
    "gate.reject": ("reject: {path} — {reason}", ERR, EXIT_REJECT),
    # --- info (stdout, exit 0) ---
    "check.pass": ("pass: {path} is eligible (gate: {gate})", OUT, EXIT_OK),
    "stage.added": ("staged: {path} [{levels}]", OUT, EXIT_OK),
    "stage.dropped": ("dropped: {path}", OUT, EXIT_OK),
    "stage.nothing": ("nothing staged", OUT, EXIT_OK),
    "stage.list_item": ("  {path} [{levels}]", OUT, EXIT_OK),
    "enshell.sealed": ("sealed: {path} -> {out}", OUT, EXIT_OK),
    "enshell.done": ("enshell complete: {count} unit(s); staging cleared", OUT, EXIT_OK),
}


class EngineError(Exception):
    """Raised by pipeline code; carries a catalog key + params so the driver
    can render it. Pipeline code must never print directly."""

    def __init__(self, key, **params):
        self.key = key
        self.params = params
        super().__init__(key)


def render(key, **params):
    """Return (line, stream, exit_code) for a catalog key."""
    template, stream, code = CATALOG[key]
    return template.format(**params), stream, code
