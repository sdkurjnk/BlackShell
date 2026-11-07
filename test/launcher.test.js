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
const fixture = fileURLToPath(new URL("../src/engine/examples/add2.c", import.meta.url));
const run = (args, opts) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", ...opts });

test("check renders a pass line and exits 0", () => {
  const r = run(["check", fixture]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /pass:.*add2\.c/);
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

test("add then enshell seals a staged unit to an object file", () => {
  const work = mkdtempSync(join(tmpdir(), "bs-"));
  try {
    assert.equal(run(["add", fixture], { cwd: work }).status, 0);
    const e = run(["enshell"], { cwd: work });
    assert.equal(e.status, 0, e.stderr);
    assert.match(e.stdout, /sealed:/);
    assert.ok(existsSync(join(work, "add2.o")), "add2.o should be produced");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("add / list / drop manage the staging index", () => {
  const work = mkdtempSync(join(tmpdir(), "bs-"));
  try {
    run(["add", fixture, "--level", "L1,L2"], { cwd: work });
    assert.match(run(["list"], { cwd: work }).stdout, /add2\.c \[L1,L2\]/);
    assert.equal(run(["drop", fixture], { cwd: work }).status, 0);
    assert.match(run(["list"], { cwd: work }).stdout, /nothing staged/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
