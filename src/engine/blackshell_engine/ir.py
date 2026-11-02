"""Toy IR model — load + validate (docs/interfaces/03-ir-model.md).

The IR is JSON. A module is one sealed unit: a function with value inputs
(`params`), value outputs (`returns`), virtual registers (`locals`), and basic
blocks. No pointers / globals / I/O are representable — that is the §5
condition-1 isolation enforced structurally.
"""

import json

BIN_OPS = {"add", "sub", "mul", "and", "or", "xor", "shl", "shr"}


class IRError(Exception):
    """Malformed IR, or an interpreter runtime fault on toy IR."""


def load_ir(path):
    with open(path, "r", encoding="utf-8") as f:
        module = json.load(f)
    validate(module)
    return module


def validate(m):
    for key in ("name", "params", "returns", "locals", "blocks"):
        if key not in m:
            raise IRError(f"missing field: {key}")
    if not m["blocks"]:
        raise IRError("module has no blocks")

    labels = {b["label"] for b in m["blocks"]}
    for b in m["blocks"]:
        if "insts" not in b:
            raise IRError(f"block {b.get('label')!r} has no insts")
        for inst in b["insts"]:
            op = inst.get("op")
            if op is None:
                raise IRError(f"instruction without op in block {b['label']!r}")
            if op == "br" and (inst["then"] not in labels or inst["else"] not in labels):
                raise IRError(f"br to unknown label in block {b['label']!r}")
            if op == "jmp" and inst["target"] not in labels:
                raise IRError(f"jmp to unknown label in block {b['label']!r}")
    return m
