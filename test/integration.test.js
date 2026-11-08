import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// End-to-end: the built TS launcher drives the built C++ engine.
// `pretest` builds dist/cli.js + the engine binaries first.
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const fixture = fileURLToPath(new URL("../src/engine/examples/add2.c", import.meta.url));
const run = (args, opts) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", ...opts });
const withWork = (fn) => {
  const work = mkdtempSync(join(tmpdir(), "bs-"));
  try { return fn(work); } finally { rmSync(work, { recursive: true, force: true }); }
};

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

test("check with no source argument exits 1", () => {
  const r = run(["check"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /exactly one <source>/);
});

test("-v prints the package version", () => {
  const r = run(["-v"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test("help / empty argv print usage and exit 0", () => {
  assert.match(run(["help"]).stdout, /blackshell <command>/);
  assert.match(run([]).stdout, /blackshell <command>/);
});

test("add then enshell seals a staged unit to an object file", () => {
  withWork((work) => {
    assert.equal(run(["add", fixture], { cwd: work }).status, 0);
    const e = run(["enshell"], { cwd: work });
    assert.equal(e.status, 0, e.stderr);
    assert.match(e.stdout, /sealed:/);
    assert.ok(existsSync(join(work, "add2.o")), "add2.o should be produced");
  });
});

test("add without --level defaults to L3", () => {
  withWork((work) => {
    run(["add", fixture], { cwd: work });
    assert.match(run(["list"], { cwd: work }).stdout, /add2\.c \[L3\]/);
  });
});

test("add / list / drop manage the staging index", () => {
  withWork((work) => {
    run(["add", fixture, "--level", "L1,L2"], { cwd: work });
    assert.match(run(["list"], { cwd: work }).stdout, /add2\.c \[L1,L2\]/);
    assert.equal(run(["drop", fixture], { cwd: work }).status, 0);
    assert.match(run(["list"], { cwd: work }).stdout, /nothing staged/);
  });
});

test("enshell with nothing staged is a no-op, exit 0", () => {
  withWork((work) => {
    const r = run(["enshell"], { cwd: work });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /nothing staged/);
  });
});

test("add rejects a file that does not exist", () => {
  withWork((work) => {
    const r = run(["add", "nope.c"], { cwd: work });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /file not found/);
  });
});

test("enshell surfaces a frontend (clang) failure as exit 1", () => {
  withWork((work) => {
    const bad = join(work, "bad.c");
    writeFileSync(bad, "int main( { this is not valid C\n");
    assert.equal(run(["add", bad], { cwd: work }).status, 0);
    const e = run(["enshell"], { cwd: work });
    assert.equal(e.status, 1);
    assert.match(e.stderr, /clang \(frontend\) failed/);
  });
});
