import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triage, VERSION, USAGE } from '../src/cli/index.js';

test('version flags are answered as meta by JS (no engine needed)', () => {
  assert.deepEqual(triage(['--version']), { meta: VERSION });
  assert.deepEqual(triage(['-v']), { meta: VERSION });
  assert.deepEqual(triage(['version']), { meta: VERSION });
});

test('bare invocation and top-level help show usage as meta', () => {
  assert.deepEqual(triage([]), { meta: USAGE });
  assert.deepEqual(triage(['--help']), { meta: USAGE });
  assert.deepEqual(triage(['-h']), { meta: USAGE });
});

test('real commands are forwarded to the engine, not parsed by JS', () => {
  assert.deepEqual(triage(['enshell']), { forward: true });
  assert.deepEqual(triage(['add', 'foo.ir.json']), { forward: true });
  assert.deepEqual(triage(['help', 'enshell']), { forward: true });
  // JS does not know the command set, so unknown tokens forward too.
  assert.deepEqual(triage(['frobnicate']), { forward: true });
});
