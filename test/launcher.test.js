import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Integration smoke: the built TS launcher drives the built C++ engine.
// `pretest` builds dist/cli.js + the engine binary first.
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const run = (args, opts) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", ...opts });

test("check renders a pass line and exits 0", () => {
  const r = run(["check", "foo.c"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /pass: foo\.c/);
});

test("unknown command errors and exits 1", () => {
  const r = run(["bogus"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown command/);
});

test("-v prints the package version", () => {
  const r = run(["-v"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test("seal compiles a C source to an object file", () => {
  const fixture = fileURLToPath(new URL("../src/engine/examples/add2.c", import.meta.url));
  const work = mkdtempSync(join(tmpdir(), "bs-"));
  try {
    const r = run(["seal", fixture], { cwd: work });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /sealed:/);
    assert.ok(existsSync(join(work, "add2.o")), "add2.o should be produced");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
