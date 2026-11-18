#!/usr/bin/env node
// BlackShell Launcher (TS). Owns the CLI: parsing, the command set, the staging
// index and message rendering (docs/Architecture.md §5 hybrid). The C++ engine
// exposes per-unit primitives (check, enshell); the Launcher composes them — e.g.
// `enshell` seals every staged unit by calling the engine's enshell per unit.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, join, extname } from "node:path";

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const pkg = JSON.parse(readFileSync(here("../package.json"), "utf8")) as { version: string };

const USAGE = `blackshell <command> [options]

  check <source>              Gate verdict only (dummy: accept-all)
  add   <source> [--level N]  Stage a unit for sealing (N = strength 1..3, cumulative L1..LN; default 3)
  drop  <source>              Unstage a unit
  list                        Show staged units and their levels
  enshell                     Seal every staged unit -> object files
  help | -h                   Show this help
  -v | --version              Show the version`;

// --- staging index (.blackshell/stage.json in the working dir, git-index-like) ---
const STAGE_FILE = ".blackshell/stage.json";

interface Unit {
  path: string;
  levels: string[];
}

export function readStage(): Unit[] {
  if (!existsSync(STAGE_FILE)) {
    return [];
  }
  return JSON.parse(readFileSync(STAGE_FILE, "utf8")) as Unit[];
}

export function writeStage(units: Unit[]): void {
  mkdirSync(".blackshell", { recursive: true });
  writeFileSync(STAGE_FILE, JSON.stringify(units, null, 2) + "\n");
}

// Source extensions the Clang frontend accepts. MVP = C/C++; a new frontend
// module later just adds its extensions here. Lowercase, with the dot.
const TARGET_EXTENSIONS = [".c", ".cpp", ".cc", ".cxx"];

export function isTargetSource(path: string): boolean {
  return TARGET_EXTENSIONS.includes(extname(path).toLowerCase());
}

const MAX_LEVEL = 3; // L1..L3 are the noising dials defined in the plan §6.

// User-facing dial "N" -> the cumulative set {L1..LN} the engine consumes.
// The levels stay an orthogonal set in the engine/harness (§9 per-pass toggle);
// this ladder is only the simple front-door UX. undefined -> full strength.
// Returns null on an invalid dial so the caller can reject at the boundary.
export function expandLevel(value: string | undefined): string[] | null {
  const n = value === undefined ? MAX_LEVEL : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LEVEL) {
    return null;
  }
  return Array.from({ length: n }, (_, i) => `L${i + 1}`);
}

export function showLevels(levels: string[]): string {
  if (levels.length === 0) {
    return "L0 (identity)";
  }
  return levels.join(",");
}

// Resolve the engine binary. The published package pulls the matching engine as an
// optional dependency @sdkurjnk/blackshell-<platform>-<arch> (os/cpu-gated, so npm
// installs only the host's); resolve its binary. A local dev build in build/ is the
// fallback when no platform package is installed.
function enginePath(): string {
  const exe = process.platform === "win32" ? "blackshell-engine.exe" : "blackshell-engine";
  const pkg = `@sdkurjnk/blackshell-${process.platform}-${process.arch}`;
  try {
    const require = createRequire(import.meta.url);
    return join(dirname(require.resolve(`${pkg}/package.json`)), exe);
  } catch {
    return here(`../build/${exe}`);
  }
}

// --- engine (C++) per-unit primitive call; returns the structured token line ---
function engine(args: string[]): { token: string; status: number } {
  const bin = enginePath();
  const res = spawnSync(bin, args, { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
  if (res.error) {
    console.error("error: engine not found (build it: npm run build:engine)");
    return { token: "", status: 127 };
  }
  const token = (res.stdout ?? "").trim().split("\n").pop() ?? "";
  return { token, status: res.status ?? 1 };
}

// engine token -> rendered message. The engine never renders.
export function render(token: string): { line: string; err: boolean } {
  const [key, ...a] = token.split(" ");
  switch (key) {
    case "gate.ok": {
      return { line: `pass: ${a[0]} is eligible`, err: false };
    }
    case "gate.reject": {
      return { line: `reject: ${a[0]} — ineligible`, err: true };
    }
    case "sealed": {
      return { line: `sealed: ${a[0]} -> ${a[1]}`, err: false };
    }
    case "frontend.failed": {
      return { line: `error: clang (frontend) failed on ${a[0]}`, err: true };
    }
    case "backend.failed": {
      return { line: `error: llc (backend) failed on ${a[0]}`, err: true };
    }
    case "verify.broken": {
      return { line: `error: noising broke equivalence on ${a[0]}`, err: true };
    }
    case "arg.one_positional": {
      return { line: `error: expected exactly one <source> argument`, err: true };
    }
    case "cmd.unknown": {
      return { line: `error: unknown command: ${a[0]}`, err: true };
    }
    default: {
      return { line: token, err: true };
    }
  }
}

function emit(token: string): void {
  if (!token) {
    return;
  }
  const { line, err } = render(token);
  if (err) {
    console.error(line);
  } else {
    console.log(line);
  }
}

// --- arg helpers ---
export function popOption(rest: string[], name: string): { value: string | undefined; rest: string[] } {
  const i = rest.indexOf(name);
  if (i === -1) {
    return { value: undefined, rest };
  }
  return { value: rest[i + 1], rest: rest.slice(0, i).concat(rest.slice(i + 2)) };
}

export function onePositional(rest: string[]): string | undefined {
  const positionals = rest.filter((a) => !a.startsWith("--"));
  if (positionals.length !== 1) {
    return undefined;
  }
  return positionals[0];
}

// engine argv for sealing one unit; forwards the staged levels (empty = L0).
export function enshellArgs(u: Unit): string[] {
  const args = ["enshell", u.path];
  if (u.levels.length > 0) {
    args.push("--level", u.levels.join(","));
  }
  return args;
}

// --- commands ---
function cmdCheck(rest: string[]): number {
  const src = onePositional(rest);
  if (src === undefined) {
    console.error("error: expected exactly one <source> argument");
    return 1;
  }
  if (!isTargetSource(src)) {
    console.error(`error: unsupported source type: ${src} (target: ${TARGET_EXTENSIONS.join(" ")})`);
    return 1;
  }
  const { token, status } = engine(["check", src]);
  emit(token);
  return status;
}

function cmdAdd(rest: string[]): number {
  const opt = popOption(rest, "--level");
  const src = onePositional(opt.rest);
  if (src === undefined) {
    console.error("error: expected exactly one <source> argument");
    return 1;
  }
  if (!existsSync(src)) {
    console.error(`error: file not found: ${src}`);
    return 1;
  }
  if (!isTargetSource(src)) {
    console.error(`error: unsupported source type: ${src} (target: ${TARGET_EXTENSIONS.join(" ")})`);
    return 1;
  }
  const levels = expandLevel(opt.value);
  if (levels === null) {
    console.error(`error: --level must be an integer 1..${MAX_LEVEL}`);
    return 1;
  }
  const units = readStage().filter((u) => u.path !== src);
  units.push({ path: src, levels });
  writeStage(units);
  console.log(`staged: ${src} [${showLevels(levels)}]`);
  return 0;
}

function cmdDrop(rest: string[]): number {
  const src = onePositional(rest);
  if (src === undefined) {
    console.error("error: expected exactly one <source> argument");
    return 1;
  }
  const units = readStage();
  const kept = units.filter((u) => u.path !== src);
  if (kept.length === units.length) {
    console.error(`error: not staged: ${src}`);
    return 1;
  }
  writeStage(kept);
  console.log(`dropped: ${src}`);
  return 0;
}

function cmdList(): number {
  const units = readStage();
  if (units.length === 0) {
    console.log("nothing staged");
    return 0;
  }
  for (const u of units) {
    console.log(`  ${u.path} [${showLevels(u.levels)}]`);
  }
  return 0;
}

function cmdEnshell(): number {
  const units = readStage();
  if (units.length === 0) {
    console.log("nothing staged");
    return 0;
  }
  let code = 0;
  for (const u of units) {
    const { token, status } = engine(enshellArgs(u));
    emit(token);
    if (status !== 0) {
      code = status;
    }
  }
  writeStage([]); // 1-shot: staging is consumed by enshell
  console.log(`enshell complete: ${units.length} unit(s); staging cleared`);
  return code;
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  if (cmd === "-v" || cmd === "--version" || cmd === "version") {
    console.log(pkg.version);
    return 0;
  }
  if (cmd === undefined || cmd === "help" || cmd === "-h" || cmd === "--help") {
    console.log(USAGE);
    return 0;
  }
  switch (cmd) {
    case "check": {
      return cmdCheck(rest);
    }
    case "add": {
      return cmdAdd(rest);
    }
    case "drop": {
      return cmdDrop(rest);
    }
    case "list": {
      return cmdList();
    }
    case "enshell": {
      return cmdEnshell();
    }
    default: {
      console.error(`error: unknown command: ${cmd}`);
      console.error(USAGE);
      return 1;
    }
  }
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
