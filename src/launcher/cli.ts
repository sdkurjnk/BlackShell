#!/usr/bin/env node
// BlackShell Launcher (TS). Owns the CLI: parsing, the command set, the staging
// index and message rendering (docs/Architecture.md §5 hybrid). The C++ engine
// exposes per-unit primitives (check, enshell); the Launcher composes them — e.g.
// `enshell` seals every staged unit by calling the engine's enshell per unit.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const pkg = JSON.parse(readFileSync(here("../package.json"), "utf8")) as { version: string };

const USAGE = `blackshell <command> [options]

  check <source>              Gate verdict only (dummy: accept-all)
  add   <source> [--level L]  Stage a unit for sealing (L = e.g. L1,L2; default L3)
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

function readStage(): Unit[] {
  if (!existsSync(STAGE_FILE)) {
    return [];
  }
  return JSON.parse(readFileSync(STAGE_FILE, "utf8")) as Unit[];
}

function writeStage(units: Unit[]): void {
  mkdirSync(".blackshell", { recursive: true });
  writeFileSync(STAGE_FILE, JSON.stringify(units, null, 2) + "\n");
}

function showLevels(levels: string[]): string {
  if (levels.length === 0) {
    return "L0 (identity)";
  }
  return levels.join(",");
}

// --- engine (C++) per-unit primitive call; returns the structured token line ---
function engine(args: string[]): { token: string; status: number } {
  const bin = here(process.platform === "win32" ? "../build/blackshell-engine.exe" : "../build/blackshell-engine");
  const res = spawnSync(bin, args, { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
  if (res.error) {
    console.error("error: engine not found (build it: npm run build:engine)");
    return { token: "", status: 127 };
  }
  const token = (res.stdout ?? "").trim().split("\n").pop() ?? "";
  return { token, status: res.status ?? 1 };
}

// engine token -> rendered message. The engine never renders.
function render(token: string): { line: string; err: boolean } {
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
function popOption(rest: string[], name: string): { value: string | undefined; rest: string[] } {
  const i = rest.indexOf(name);
  if (i === -1) {
    return { value: undefined, rest };
  }
  return { value: rest[i + 1], rest: rest.slice(0, i).concat(rest.slice(i + 2)) };
}

function onePositional(rest: string[]): string | undefined {
  const positionals = rest.filter((a) => !a.startsWith("--"));
  if (positionals.length !== 1) {
    return undefined;
  }
  return positionals[0];
}

// --- commands ---
function cmdCheck(rest: string[]): number {
  const src = onePositional(rest);
  if (src === undefined) {
    console.error("error: expected exactly one <source> argument");
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
  const levels = opt.value ? opt.value.split(",").map((s) => s.trim()).filter(Boolean) : ["L3"];
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
    const { token, status } = engine(["enshell", u.path]);
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

process.exit(main(process.argv.slice(2)));
