import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Runs the C++ engine unit-test binary (built by `pretest`) in a temp cwd so its
// intermediate artifacts (.ll/.o) land there. Non-zero exit = a primitive failed.
const bin = fileURLToPath(new URL(
  process.platform === "win32" ? "../build/blackshell-engine-test.exe" : "../build/blackshell-engine-test",
  import.meta.url));
const fixture = fileURLToPath(new URL("../src/engine/examples/add2.c", import.meta.url));

test("engine unit tests (C++) all pass", () => {
  const work = mkdtempSync(join(tmpdir(), "bs-eng-"));
  try {
    const r = spawnSync(bin, [fixture], { cwd: work, encoding: "utf8" });
    assert.equal(r.status, 0, (r.stdout ?? "") + (r.stderr ?? ""));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
