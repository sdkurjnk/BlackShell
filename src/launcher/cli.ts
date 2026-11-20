#!/usr/bin/env node
// BlackShell Launcher (TS). Owns the CLI: parsing, the command set, the staging
// index and message rendering (docs/Architecture.md §5 hybrid). The C++ engine
// exposes per-unit primitives (check, enshell); the Launcher composes them — e.g.
// `enshell` seals every staged unit by calling the engine's enshell per unit.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, join, extname, basename } from "node:path";

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const pkg = JSON.parse(readFileSync(here("../package.json"), "utf8")) as { version: string };

const USAGE = `blackshell <command> [options]

  check <source>              Gate verdict only (dummy: accept-all)
  add   <source> [--level N] [--name NAME]
                              Stage a unit for sealing (N = strength 1..3, cumulative
                              L1..LN; default 3). --name sets the output to NAME.o.
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
  name?: string; // output object stem; absent -> engine defaults to <source stem>
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

// engine code -> rendered message. The engine emits a bare token; we fill the
// source and object paths from the staged unit (ctx), so the engine never has
// to echo them. The engine never renders.
export function render(token: string, ctx: { src?: string; obj?: string }): { line: string; err: boolean } {
  switch (token) {
    case "gate.ok": {
      return { line: `pass: ${ctx.src} is eligible`, err: false };
    }
    case "gate.reject": {
      return { line: `reject: ${ctx.src} — ineligible`, err: true };
    }
    case "sealed": {
      return { line: `sealed: ${ctx.src} -> ${ctx.obj}`, err: false };
    }
    case "frontend.failed": {
      return { line: `error: clang (frontend) failed on ${ctx.src}`, err: true };
    }
    case "backend.failed": {
      return { line: `error: llc (backend) failed on ${ctx.src}`, err: true };
    }
    case "verify.broken": {
      return { line: `error: noising broke equivalence on ${ctx.src}`, err: true };
    }
    case "arg.one_positional": {
      return { line: `error: expected exactly one <source> argument`, err: true };
    }
    case "cmd.unknown": {
      return { line: `error: unknown command`, err: true };
    }
    default: {
      return { line: token, err: true };
    }
  }
}

function emit(token: string, ctx: { src?: string; obj?: string }): void {
  if (!token) {
    return;
  }
  const { line, err } = render(token, ctx);
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

// First leftover "--flag" once the command's known options are popped off.
// A command calls this on its remaining args to reject typos/unsupported flags
// instead of silently dropping them (onePositional filters "--" tokens out).
export function strayOption(rest: string[]): string | undefined {
  return rest.find((a) => a.startsWith("--"));
}

// engine argv for sealing one unit; forwards the staged levels (empty = L0) and,
// if named, the output path (engine owns file I/O; we pass an opaque path).
export function enshellArgs(u: Unit): string[] {
  const args = ["enshell", u.path];
  if (u.levels.length > 0) {
    args.push("--level", u.levels.join(","));
  }
  if (u.name !== undefined) {
    args.push("--out", `${u.name}.o`);
  }
  return args;
}

// The object path the engine writes for a unit, mirroring the engine's default
// (<stem>.o): the --name stem if set, else the source's basename stem. Used to
// render the sealed line, since the engine no longer echoes the path.
export function objOf(u: Unit): string {
  const stem = u.name ?? basename(u.path, extname(u.path));
  return `${stem}.o`;
}

// --- commands ---
function cmdCheck(rest: string[]): number {
  const stray = strayOption(rest);
  if (stray !== undefined) {
    console.error(`error: unknown option: ${stray}`);
    return 1;
  }
  const src = onePositional(rest);
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
  const { token, status } = engine(["check", src]);
  emit(token, { src });
  return status;
}

function cmdAdd(rest: string[]): number {
  const levelOpt = popOption(rest, "--level");
  const nameOpt = popOption(levelOpt.rest, "--name");
  const stray = strayOption(nameOpt.rest);
  if (stray !== undefined) {
    console.error(`error: unknown option: ${stray}`);
    return 1;
  }
  const src = onePositional(nameOpt.rest);
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
  const levels = expandLevel(levelOpt.value);
  if (levels === null) {
    console.error(`error: --level must be an integer 1..${MAX_LEVEL}`);
    return 1;
  }
  // --name was given but swallowed the next flag / had no value.
  if (rest.includes("--name") && (nameOpt.value === undefined || nameOpt.value === "" || nameOpt.value.startsWith("--"))) {
    console.error("error: --name requires a value");
    return 1;
  }
  // --name is a bare object stem, not a path: reject separators so the output
  // can't escape the working dir (we hand it to the engine as the object path).
  if (nameOpt.value !== undefined && /[/\\]/.test(nameOpt.value)) {
    console.error("error: --name must be a bare filename (no path separators)");
    return 1;
  }
  const unit: Unit = { path: src, levels };
  if (nameOpt.value !== undefined) {
    unit.name = nameOpt.value;
  }
  const units = readStage().filter((u) => u.path !== src);
  // Two units sharing an output name would clobber each other at enshell time.
  if (unit.name !== undefined && units.some((u) => u.name === unit.name)) {
    console.error(`error: output name already staged: ${unit.name}.o`);
    return 1;
  }
  units.push(unit);
  writeStage(units);
  const out = unit.name === undefined ? "" : ` -> ${unit.name}.o`;
  console.log(`staged: ${src} [${showLevels(levels)}]${out}`);
  return 0;
}

function cmdDrop(rest: string[]): number {
  const stray = strayOption(rest);
  if (stray !== undefined) {
    console.error(`error: unknown option: ${stray}`);
    return 1;
  }
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
    const out = u.name === undefined ? "" : ` -> ${u.name}.o`;
    console.log(`  ${u.path} [${showLevels(u.levels)}]${out}`);
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
    emit(token, { src: u.path, obj: objOf(u) });
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
