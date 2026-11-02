"""Pass registry + dummy passes (docs/interfaces/04-pass-contract.md).

Two pass kinds, two signatures:
  - noising  : IR -> IR         (semantics-preserving; here: identity)
  - gate     : IR -> Verdict    (read-only; here: accept-all)

The working-skeleton point: dummy and real passes share these signatures, so
replacing a dummy with a real pass never touches the driver (just swap the
registry entry). Identity noising is SAFE ("correct but unprotected");
accept-all gate is NOT — it gives a false "sealed" confidence and must be
replaced before shipping.
"""

import copy


def dummy_gate(module):
    """IR -> Verdict. DUMMY accept-all. Replace with the real §5 condition-1
    static check before shipping."""
    return {"ok": True, "dummy": True}


def _identity(module):
    """IR -> IR, unchanged. Returns a copy so callers can treat passes as pure."""
    return copy.deepcopy(module)


# Gate always runs ahead of noising (verdict carries the pass name).
GATE = ("dummy-accept-all", dummy_gate)

# Noising passes keyed by level; all identity in the skeleton.
NOISING = {
    "L1": ("identity-L1", _identity),
    "L2": ("identity-L2", _identity),
    "L3": ("identity-L3", _identity),
}

# Fixed application order regardless of selection order.
LEVEL_ORDER = ("L1", "L2", "L3")
