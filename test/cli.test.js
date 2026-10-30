import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, VERSION } from '../src/cli.js';

test('version flags return the package version', () => {
  assert.equal(run(['--version']), VERSION);
  assert.equal(run(['-v']), VERSION);
  assert.equal(run(['version']), VERSION);
});

test('help is shown by default and on --help', () => {
  assert.match(run([]), /^blackshell <command>/);
  assert.match(run(['--help']), /Commands:/);
  assert.match(run(['-h']), /Commands:/);
});

test('unknown command reports and still shows help', () => {
  const out = run(['frobnicate']);
  assert.match(out, /Unknown command: frobnicate/);
  assert.match(out, /Commands:/);
});
