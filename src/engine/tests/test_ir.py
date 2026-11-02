import tempfile
import unittest
from pathlib import Path

from blackshell_engine import ir
from blackshell_engine.messages import EngineError

EXAMPLES = Path(__file__).resolve().parent.parent / "examples"


class IrTest(unittest.TestCase):
    def test_valid_loads(self):
        m = ir.load_ir(str(EXAMPLES / "add2.ir.json"))
        self.assertEqual(m["name"], "add2")

    def test_missing_field(self):
        with self.assertRaises(EngineError) as cm:
            ir.validate({"name": "x", "params": [], "returns": [], "locals": []})
        self.assertEqual(cm.exception.key, "ir.missing_field")

    def test_no_blocks(self):
        with self.assertRaises(EngineError) as cm:
            ir.validate(
                {"name": "x", "params": [], "returns": [], "locals": [], "blocks": []}
            )
        self.assertEqual(cm.exception.key, "ir.no_blocks")

    def test_bad_branch(self):
        module = {
            "name": "x", "params": [], "returns": [], "locals": [],
            "blocks": [
                {"label": "entry", "insts": [
                    {"op": "br", "cond": "a", "then": "nowhere", "else": "entry"}
                ]}
            ],
        }
        with self.assertRaises(EngineError) as cm:
            ir.validate(module)
        self.assertEqual(cm.exception.key, "ir.bad_branch")

    def test_file_not_found(self):
        with self.assertRaises(EngineError) as cm:
            ir.load_ir("definitely-not-here.ir.json")
        self.assertEqual(cm.exception.key, "file.not_found")

    def test_bad_json(self):
        with tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            f.write("{ this is not json")
            path = f.name
        with self.assertRaises(EngineError) as cm:
            ir.load_ir(path)
        self.assertEqual(cm.exception.key, "ir.bad_json")


if __name__ == "__main__":
    unittest.main()
