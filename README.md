# Black-Shell

> Build-stage protection tool that seals critical code regions at the compiler
> IR level, so they talk to the outside only by value.

Most programs don't need every line hidden — just a few critical regions (a
secret algorithm, a core transform). Black-Shell seals **those** regions into an
isolated black box with a value-only boundary, raising the cost of reusing or
re-implementing the logic extracted by (increasingly AI-assisted) reverse
engineering. It is a **copy-protection layer**, composed on top of existing
distribution/anti-tamper protectors — not a replacement for them.

See [`docs/BlackShell_Plan.md`](docs/BlackShell_Plan.md) for the full concept,
threat model, and theory.

## Status

**Working skeleton.** The pipeline runs end to end — real `clang`/`llc` compile a
source unit to an object file — but the three IP stages (eligibility **gate**,
**noising** L1–L3, equivalence **harness**) are **dummies** (accept-all gate,
identity noising), so the layer contracts are locked and real passes drop in
without touching call sites. Dummy output is correct-but-unprotecting — **do not
treat it as sealed.**

Roadmap: real eligibility gate (§5), real noising L1–L3 incl. carry-sensitive MBA.

## Requirements

- **Node.js ≥ 20** — the CLI (TS Launcher).
- **clang + llc on `PATH`** — the C++ engine shells out to them (source → LLVM IR → object), at runtime.
- **g++ (C++17)** — only to build the engine from a clone. The published npm package ships a
  prebuilt engine for `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `win32-x64`.

## Build & run (from a clone)

```sh
npm install
npm run build            # g++ engine + tsc launcher
node dist/cli.js --version
npm test                 # full test suite
```

`npm link` (or a global install) exposes the `blackshell` command; otherwise use
`node dist/cli.js <command>`.

## Usage

Units are **source files**. git-style staging — stage units, then seal the set.

```sh
blackshell check <source>                # preview: is this region eligible? (gate only)
blackshell add   <source> --level L1,L3   # stage a unit (default level: L3)
blackshell list                          # show staged units and levels
blackshell drop  <source>                # unstage
blackshell enshell                       # seal all staged units -> object files
```

Example:

```sh
blackshell add src/engine/examples/add2.c --level L1,L3
blackshell enshell
```

## How it works

```
[Launcher] TS / npm        argv        [Engine] C++ binary
 src/launcher/cli.ts  ───────────────▶  src/engine/
 CLI · staging · render   token · exit   clang → gate → noising → harness → llc → .o
```

The Launcher owns the CLI (parsing, staging, rendering); the engine runs the seal
pipeline per unit and returns a structured token. Layer contracts and the full
architecture are in [`docs/interfaces/`](docs/interfaces/) and
[`docs/Architecture.md`](docs/Architecture.md). Contributing follows GitFlow —
see [`docs/contributing-gitflow.md`](docs/contributing-gitflow.md).

## License

[MIT](LICENSE) © sdkurjnk
