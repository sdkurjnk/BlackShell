import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

export const VERSION = pkg.version;

// Minimal top-level usage. Intentionally does NOT list commands — the engine
// owns the command set (single source of truth), so JS can't drift from it.
export const USAGE = `blackshell <command> [options]

Build-stage protection tool. Seals critical code regions at the compiler IR
level so they talk to the outside only by value.

Run \`blackshell help\` for commands, \`blackshell -v\` for the version.`;

// Pure triage — the external(JS)/internal(engine) seam (docs/interfaces/01).
// JS answers only what packaging *owns* (version = the npm package value) plus
// a bare top-level usage, so both work even if the engine is missing. Every
// real command is forwarded to the engine verbatim; JS does not parse them.
//
// Returns { meta: string } to answer in JS, or { forward: true } to hand argv
// to the engine.
export function triage(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === '-v' || cmd === '--version' || cmd === 'version') {
    return { meta: VERSION };
  }
  if (cmd === undefined) {
    return { meta: USAGE };
  }
  if ((cmd === '-h' || cmd === '--help') && rest.length === 0) {
    return { meta: USAGE };
  }
  return { forward: true };
}
