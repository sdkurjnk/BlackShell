#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { delimiter } from 'node:path';
import { triage } from '../src/cli/index.js';

const argv = process.argv.slice(2);
const t = triage(argv);

// Meta queries (version, bare usage) are answered here without the engine.
if (t.meta !== undefined) {
  process.stdout.write(t.meta + '\n');
  process.exit(0);
}

// Everything else forwards to the internal engine. In the PoC the seam is a
// subprocess (Python); in production it becomes a C-ABI native binary. The
// protocol — argv in, stdio inherited, exit code propagated — stays identical
// (docs/interfaces/01-cli-seam.md).
// The engine package is made importable via PYTHONPATH; cwd stays the user's
// working directory so IR paths and the .blackshell/ index resolve there.
const engineDir = fileURLToPath(new URL('../src/engine', import.meta.url));
const pythonPath = process.env.PYTHONPATH
  ? engineDir + delimiter + process.env.PYTHONPATH
  : engineDir;
const candidates = ['python', 'python3', 'py'];

let res;
for (const py of candidates) {
  res = spawnSync(py, ['-m', 'blackshell_engine', ...argv], {
    stdio: 'inherit',
    env: { ...process.env, PYTHONPATH: pythonPath },
  });
  // Try the next interpreter name only when this one isn't on PATH.
  if (!(res.error && res.error.code === 'ENOENT')) break;
}

if (res.error) {
  if (res.error.code === 'ENOENT') {
    process.stderr.write(
      'blackshell: Python engine not found. The PoC engine needs Python 3 on PATH.\n',
    );
    process.exit(127);
  }
  process.stderr.write(`blackshell: failed to launch engine: ${res.error.message}\n`);
  process.exit(127);
}

process.exit(res.status ?? 1);
