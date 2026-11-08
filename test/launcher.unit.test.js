import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, showLevels, popOption, onePositional, readStage, writeStage } from "../dist/cli.js";

// Pure launcher units — no engine, no spawn.

test("render maps engine tokens to user messages", () => {
  assert.deepEqual(render("gate.ok a.c"), { line: "pass: a.c is eligible", err: false });
  assert.equal(render("gate.reject a.c").err, true);
  assert.deepEqual(render("sealed a.c a.o"), { line: "sealed: a.c -> a.o", err: false });
  assert.equal(render("frontend.failed a.c").err, true);
  assert.equal(render("backend.failed a.c").err, true);
  assert.equal(render("verify.broken a.c").err, true);
  // unknown token falls through to the raw token as an error line
  assert.deepEqual(render("weird.token x"), { line: "weird.token x", err: true });
});

test("showLevels: empty = L0 identity, otherwise joined", () => {
  assert.equal(showLevels([]), "L0 (identity)");
  assert.equal(showLevels(["L1", "L2"]), "L1,L2");
  assert.equal(showLevels(["L3"]), "L3");
});

test("popOption extracts a flag value and removes the pair", () => {
  assert.deepEqual(popOption(["a.c", "--level", "L1,L2"], "--level"), { value: "L1,L2", rest: ["a.c"] });
  assert.deepEqual(popOption(["a.c"], "--level"), { value: undefined, rest: ["a.c"] });
});

test("onePositional returns the lone positional (ignoring flags), else undefined", () => {
  assert.equal(onePositional(["a.c"]), "a.c");
  assert.equal(onePositional(["a.c", "--level"]), "a.c"); // flags filtered out
  assert.equal(onePositional([]), undefined);
  assert.equal(onePositional(["a.c", "b.c"]), undefined);
});

test("writeStage/readStage round-trip through the index file", () => {
  const cwd = process.cwd();
  const work = mkdtempSync(join(tmpdir(), "bs-stage-"));
  process.chdir(work);
  try {
    assert.deepEqual(readStage(), []); // no file yet
    const units = [{ path: "a.c", levels: ["L3"] }, { path: "b.c", levels: [] }];
    writeStage(units);
    assert.deepEqual(readStage(), units);
  } finally {
    process.chdir(cwd);
    rmSync(work, { recursive: true, force: true });
  }
});
