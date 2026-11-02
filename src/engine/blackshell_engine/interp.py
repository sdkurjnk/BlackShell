"""Toy interpreter — executes an IR module on value inputs.

This is the PoC's only execution backend (no native/LLVM yet) and the primitive
the equivalence harness is built on: `verify` just runs two modules here and
compares outputs (docs/interfaces/05). PoC/dev-only; production execution is
native.
"""

from .ir import BIN_OPS
from .messages import EngineError

_STEP_LIMIT = 1_000_000


def run(module, inputs):
    """inputs: {param_name: int} -> {return_name: int}."""
    regs = {}
    for p in module["params"]:
        if p not in inputs:
            raise EngineError("interp.missing_input", param=p)
        regs[p] = int(inputs[p])

    mem = {}  # isolated local store, index -> value
    blocks = {b["label"]: b for b in module["blocks"]}
    cur = module["blocks"][0]["label"]

    steps = 0
    while True:
        steps += 1
        if steps > _STEP_LIMIT:
            raise EngineError("interp.step_limit")

        next_label = None
        for inst in blocks[cur]["insts"]:
            op = inst["op"]
            if op == "const":
                regs[inst["dst"]] = int(inst["imm"])
            elif op == "mov":
                regs[inst["dst"]] = regs[inst["src"]]
            elif op in BIN_OPS:
                regs[inst["dst"]] = _binop(op, regs[inst["lhs"]], regs[inst["rhs"]])
            elif op == "load":
                regs[inst["dst"]] = mem.get(_addr(regs, inst["addr"]), 0)
            elif op == "store":
                mem[_addr(regs, inst["addr"])] = regs[inst["src"]]
            elif op == "br":
                next_label = inst["then"] if regs[inst["cond"]] != 0 else inst["else"]
                break
            elif op == "jmp":
                next_label = inst["target"]
                break
            elif op == "ret":
                return {r: regs[r] for r in module["returns"]}
            else:
                raise EngineError("interp.unknown_op", op=op)

        if next_label is None:
            # Fell off the end of a block with no branch/ret: implicit return.
            return {r: regs.get(r, 0) for r in module["returns"]}
        cur = next_label


def _addr(regs, a):
    return a if isinstance(a, int) else regs[a]


def _binop(op, a, b):
    if op == "add":
        return a + b
    if op == "sub":
        return a - b
    if op == "mul":
        return a * b
    if op == "and":
        return a & b
    if op == "or":
        return a | b
    if op == "xor":
        return a ^ b
    if op == "shl":
        return a << b
    if op == "shr":
        return a >> b
    raise EngineError("interp.unknown_op", op=op)
