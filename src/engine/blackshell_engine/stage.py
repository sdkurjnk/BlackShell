"""Staging index (docs/interfaces/02-driver.md).

The git-style index shared by add / drop / list. Lives in the working
directory at .blackshell/stage.json (cf. .git/index). Records each staged
unit's path and its per-unit noising levels.
"""

import json
import os

INDEX_DIR = ".blackshell"
INDEX_PATH = os.path.join(INDEX_DIR, "stage.json")


def _read():
    if not os.path.exists(INDEX_PATH):
        return {"units": []}
    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _write(index):
    os.makedirs(INDEX_DIR, exist_ok=True)
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)
        f.write("\n")


def add(path, levels):
    index = _read()
    units = [u for u in index["units"] if u["path"] != path]
    units.append({"path": path, "levels": levels})
    index["units"] = units
    _write(index)


def drop(path):
    index = _read()
    before = len(index["units"])
    index["units"] = [u for u in index["units"] if u["path"] != path]
    _write(index)
    return before != len(index["units"])


def staged():
    return _read()["units"]


def clear():
    _write({"units": []})
