import unittest
from pathlib import Path

from blackshell_engine import interp, ir
from blackshell_engine.messages import EngineError

EXAMPLES = Path(__file__).resolve().parent.parent / "examples"


def _mod(insts, params=None, returns=None, locals=None):
    return {
        "name": "t",
        "params": params or [],
        "returns": returns or [],
        "locals": locals or [],
        "blocks": [{"label": "entry", "insts": insts}],
    }


class InterpTest(unittest.TestCase):
    def test_add2(self):
        m = ir.load_ir(str(EXAMPLES / "add2.ir.json"))
        self.assertEqual(interp.run(m, {"a": 40}), {"r": 42})
        self.assertEqual(interp.run(m, {"a": 0}), {"r": 2})
        self.assertEqual(interp.run(m, {"a": -5}), {"r": -3})

    def test_select_branch(self):
        m = ir.load_ir(str(EXAMPLES / "select.ir.json"))
        self.assertEqual(interp.run(m, {"a": 7, "b": 9}), {"r": 7})  # a != 0 -> a
        self.assertEqual(interp.run(m, {"a": 0, "b": 9}), {"r": 9})  # a == 0 -> b

    def test_bitwise_and_arith(self):
        # (a ^ 3) << 3 ; with a=5 -> (6) << 3 = 48
        m = _mod(
            [
                {"op": "const", "dst": "k", "imm": 3},
                {"op": "xor", "dst": "x", "lhs": "a", "rhs": "k"},
                {"op": "shl", "dst": "r", "lhs": "x", "rhs": "k"},
                {"op": "ret"},
            ],
            params=["a"],
            returns=["r"],
            locals=["k", "x"],
        )
        self.assertEqual(interp.run(m, {"a": 5}), {"r": 48})

    def test_load_store_local_memory(self):
        m = _mod(
            [
                {"op": "store", "addr": 0, "src": "a"},
                {"op": "load", "dst": "r", "addr": 0},
                {"op": "ret"},
            ],
            params=["a"],
            returns=["r"],
        )
        self.assertEqual(interp.run(m, {"a": 99}), {"r": 99})

    def test_missing_input_raises(self):
        m = ir.load_ir(str(EXAMPLES / "add2.ir.json"))
        with self.assertRaises(EngineError) as cm:
            interp.run(m, {})
        self.assertEqual(cm.exception.key, "interp.missing_input")

    def test_unknown_op_raises(self):
        m = _mod([{"op": "bogus", "dst": "r"}], returns=["r"])
        with self.assertRaises(EngineError) as cm:
            interp.run(m, {})
        self.assertEqual(cm.exception.key, "interp.unknown_op")


if __name__ == "__main__":
    unittest.main()
