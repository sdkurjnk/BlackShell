import contextlib
import io
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from blackshell_engine import driver

EXAMPLES = Path(__file__).resolve().parent.parent / "examples"
ADD2 = str(EXAMPLES / "add2.ir.json")


class DriverTest(unittest.TestCase):
    def setUp(self):
        self._old = os.getcwd()
        self._tmp = tempfile.mkdtemp()
        os.chdir(self._tmp)

    def tearDown(self):
        os.chdir(self._old)
        shutil.rmtree(self._tmp, ignore_errors=True)

    def _run(self, argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = driver.main(argv)
        return code, out.getvalue(), err.getvalue()

    # --- happy path ---

    def test_check_pass(self):
        code, out, _ = self._run(["check", ADD2])
        self.assertEqual(code, 0)
        self.assertIn("pass:", out)

    def test_add_enshell_clears_staging_and_emits(self):
        code, _, _ = self._run(["add", ADD2, "--level", "L1,L3"])
        self.assertEqual(code, 0)

        code, out, _ = self._run(["enshell", "--verify", "--emit-ir", "out"])
        self.assertEqual(code, 0)
        self.assertIn("enshell complete", out)
        self.assertTrue(os.path.exists(os.path.join("out", "add2.sealed.json")))

        code, out, _ = self._run(["list"])
        self.assertIn("nothing staged", out)

    def test_run_interprets(self):
        code, out, _ = self._run(["run", ADD2, "--input", "a=40"])
        self.assertEqual(code, 0)
        self.assertIn("r=42", out)

    # --- error / reject protocol ---

    def test_unknown_command_exit_1(self):
        code, _, err = self._run(["frobnicate"])
        self.assertEqual(code, 1)
        self.assertIn("unknown command", err)

    def test_missing_file_exit_1(self):
        code, _, err = self._run(["check", "nope.ir.json"])
        self.assertEqual(code, 1)
        self.assertIn("file not found", err)

    def test_gate_reject_exit_2(self):
        # Dummy gate accepts all, so swap in a rejecting gate to exercise the
        # reject path and the exit-2 contract (docs/interfaces/01).
        original = driver.GATE
        driver.GATE = ("test-reject", lambda m: {"ok": False, "reason": "test reason"})
        try:
            code, _, err = self._run(["check", ADD2])
        finally:
            driver.GATE = original
        self.assertEqual(code, 2)
        self.assertIn("reject:", err)
        self.assertIn("test reason", err)


if __name__ == "__main__":
    unittest.main()
