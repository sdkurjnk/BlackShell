import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

export const VERSION = pkg.version;

const HELP = `blackshell <command> [options]

Build-stage protection tool. Seals critical code regions at the compiler IR
level so they talk to the outside only by value.

Commands:
  help            Show this help
  version         Print the version

Options:
  -v, --version   Print the version
  -h, --help      Show this help

The sealing pipeline (static eligibility checker, isolated runner, L1-L3
transforms) is not implemented yet. See docs/BlackShell_Plan.md for the roadmap.`;

// Pure arg handling so it can be unit-tested without spawning a process.
// Returns the text to print; the bin wrapper is the only thing that touches I/O.
export function run(argv) {
  const [cmd] = argv;
  if (cmd === '-v' || cmd === '--version' || cmd === 'version') {
    return VERSION;
  }
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    return HELP;
  }
  return `Unknown command: ${cmd}\n\n${HELP}`;
}
