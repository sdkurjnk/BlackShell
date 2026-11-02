"""Toy IR model — load + validate (docs/interfaces/03-ir-model.md).

The IR is JSON. A module is one sealed unit: a function with value inputs
(`params`), value outputs (`returns`), virtual registers (`locals`), and basic
blocks. No pointers / globals / I/O are representable — that is the §5
condition-1 isolation enforced structurally.

This layer never prints: malformed IR raises EngineError (rendered by the
driver, docs/interfaces/02 error handling).
"""

import json

from .messages import EngineError

BIN_OPS = {"add", "sub", "mul", "and", "or", "xor", "shl", "shr"}


def load_ir(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            module = json.load(f)
    except FileNotFoundError:
        raise EngineError("file.not_found", path=path)
    except json.JSONDecodeError as e:
        raise EngineError("ir.bad_json", path=path, detail=str(e))
    validate(module)
    return module


def validate(m):
    for key in ("name", "params", "returns", "locals", "blocks"):
        if key not in m:
            raise EngineError("ir.missing_field", field=key)
    if not m["blocks"]:
        raise EngineError("ir.no_blocks")

    labels = {b["label"] for b in m["blocks"]}
    for b in m["blocks"]:
        if "insts" not in b:
            raise EngineError("ir.block_no_insts", label=b.get("label"))
        for inst in b["insts"]:
            op = inst.get("op")
            if op is None:
                raise EngineError("ir.inst_no_op", label=b["label"])
            if op == "br" and (inst["then"] not in labels or inst["else"] not in labels):
                raise EngineError("ir.bad_branch", label=b["label"])
            if op == "jmp" and inst["target"] not in labels:
                raise EngineError("ir.bad_branch", label=b["label"])
    return m
