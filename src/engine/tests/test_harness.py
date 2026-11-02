import copy
import unittest
from pathlib import Path

from blackshell_engine import harness, ir

EXAMPLES = Path(__file__).resolve().parent.parent / "examples"


class HarnessTest(unittest.TestCase):
    def test_identity_is_equivalent(self):
        m = ir.load_ir(str(EXAMPLES / "add2.ir.json"))
        report = harness.verify(m, copy.deepcopy(m), harness.sample_inputs(m))
        self.assertTrue(report["equivalent"])
        self.assertEqual(report["mismatches"], [])

    def test_catches_a_broken_transform(self):
        # The harness must FAIL when semantics change — otherwise it proves
        # nothing about real passes. Flip the +2 constant to +3.
        m = ir.load_ir(str(EXAMPLES / "add2.ir.json"))
        bad = copy.deepcopy(m)
        bad["blocks"][0]["insts"][0]["imm"] = 3
        report = harness.verify(m, bad, harness.sample_inputs(m))
        self.assertFalse(report["equivalent"])
        self.assertTrue(report["mismatches"])

    def test_sample_inputs_cover_all_params(self):
        m = ir.load_ir(str(EXAMPLES / "select.ir.json"))
        vectors = harness.sample_inputs(m, n=4)
        self.assertEqual(len(vectors), 4)
        for v in vectors:
            self.assertEqual(set(v), {"a", "b"})


if __name__ == "__main__":
    unittest.main()
