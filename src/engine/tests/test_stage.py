import os
import shutil
import tempfile
import unittest

from blackshell_engine import stage


class StageTest(unittest.TestCase):
    def setUp(self):
        self._old = os.getcwd()
        self._tmp = tempfile.mkdtemp()
        os.chdir(self._tmp)

    def tearDown(self):
        os.chdir(self._old)
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_add_list_drop_clear_roundtrip(self):
        stage.add("foo.ir.json", ["L1"])
        stage.add("bar.ir.json", [])
        self.assertEqual([u["path"] for u in stage.staged()], ["foo.ir.json", "bar.ir.json"])

        self.assertTrue(stage.drop("foo.ir.json"))
        self.assertFalse(stage.drop("missing.ir.json"))
        self.assertEqual(len(stage.staged()), 1)

        stage.clear()
        self.assertEqual(stage.staged(), [])

    def test_add_same_path_replaces(self):
        stage.add("foo.ir.json", ["L1"])
        stage.add("foo.ir.json", ["L2", "L3"])
        units = stage.staged()
        self.assertEqual(len(units), 1)
        self.assertEqual(units[0]["levels"], ["L2", "L3"])

    def test_empty_index_before_any_add(self):
        self.assertEqual(stage.staged(), [])


if __name__ == "__main__":
    unittest.main()
