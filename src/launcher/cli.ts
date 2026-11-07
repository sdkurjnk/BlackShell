#!/usr/bin/env node
// BlackShell Launcher (TS). Owns the CLI: parsing, the command set and message
// rendering (docs/Architecture.md §5 hybrid). The C++ engine returns structured
// tokens; the Launcher renders them. Meta queries (version/help) answer here.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const pkg = JSON.parse(readFileSync(here("../package.json"), "utf8")) as { version: string };

const USAGE = `blackshell <command> [options]

  check <source>   Gate verdict only (dummy: accept-all)
  seal  <source>   Compile + seal to an object file (passes are dummy)
  help | -h        Show this help
  -v | --version   Show the version`;

// engine stdout token -> rendered message. The engine never renders.
function render(token: string): { line: string; err: boolean } {
  const [key, ...a] = token.split(" ");
  switch (key) {
    case "gate.ok": return { line: `pass: ${a[0]} is eligible`, err: false };
    case "gate.reject": return { line: `reject: ${a[0]} — ineligible`, err: true };
    case "sealed": return { line: `sealed: ${a[0]} -> ${a[1]}`, err: false };
    case "frontend.failed": return { line: `error: clang (frontend) failed on ${a[0]}`, err: true };
    case "backend.failed": return { line: `error: llc (backend) failed on ${a[0]}`, err: true };
    case "arg.one_positional": return { line: `error: expected exactly one <source> argument`, err: true };
    case "cmd.unknown": return { line: `error: unknown command: ${a[0]}`, err: true };
    default: return { line: token, err: true };
  }
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  if (cmd === "-v" || cmd === "--version" || cmd === "version") { console.log(pkg.version); return 0; }
  if (cmd === undefined || cmd === "help" || cmd === "-h" || cmd === "--help") { console.log(USAGE); return 0; }
  if (cmd !== "check" && cmd !== "seal") { console.error(`error: unknown command: ${cmd}`); console.error(USAGE); return 1; }

  const engine = here(process.platform === "win32" ? "../build/blackshell-engine.exe" : "../build/blackshell-engine");
  // The engine shells out to clang/llc, which must be on PATH.
  const res = spawnSync(engine, [cmd, ...rest], { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
  if (res.error) { console.error("error: engine not found (build it: npm run build:engine)"); return 127; }
  const token = (res.stdout ?? "").trim().split("\n").pop() ?? "";
  if (token) { const { line, err } = render(token); if (err) console.error(line); else console.log(line); }
  return res.status ?? 1;
}

process.exit(main(process.argv.slice(2)));
