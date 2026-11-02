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

Early **proof of concept (v0.1.0)**. This is an LLVM-free *working skeleton*:
the whole pipeline runs end to end on a toy IR with **dummy passes** (an
accept-all gate and identity L1–L3 noising), so the layer contracts are locked
and real passes can drop in without touching call sites.

What is **not** implemented yet (roadmap): the real eligibility gate (§5), real
noising L1–L3 incl. carry-sensitive MBA, and raising the pipeline to LLVM for
native, multi-target output. Dummy passes are correct-but-unprotecting — do not
treat current output as sealed.

## Requirements

- **Node.js ≥ 20** — the CLI front door.
- **Python 3** — the PoC engine runs behind the CLI. (`blackshell --version`
  works without it; every other command needs Python on `PATH`.)

> The internal engine is Python only for the PoC; production moves it behind a
> C-ABI native boundary. See [`docs/interfaces/`](docs/interfaces/).

## Install

```sh
npm install -g @sdkurjnk/blackshell
```

Or run from a clone without installing: `node bin/blackshell.js <command>`.

## Usage

Units are toy IR files (JSON, see [`docs/interfaces/03-ir-model.md`](docs/interfaces/03-ir-model.md)).
Sealing follows a git-style staging model — stage units, then seal the set.

```sh
blackshell check <ir-file>              # preview: is this region eligible? (gate only)
blackshell add   <ir-file> --level L1,L3  # stage a unit for sealing
blackshell list                         # show staged units and levels
blackshell drop  <ir-file>              # unstage
blackshell enshell --verify             # seal all staged units -> artifacts
blackshell run   <ir-file> --input a=40 # (dev) run a unit in the toy interpreter
```

Example:

```sh
blackshell add src/engine/examples/add2.ir.json --level L1,L3
blackshell enshell --verify --emit-ir out
```

## How it works

```
[external] JS CLI  ──argv──▶  [internal] engine
  bin/ + src/cli/               src/engine/ (Python, PoC)
  packaging · version           gate → noising (L1–L3) → emit
                                equivalence harness verifies every pass
```

The external/internal split and every layer contract (CLI seam, driver, IR
model, pass contract, verification harness) are documented in
[`docs/interfaces/`](docs/interfaces/). Contributing follows GitFlow —
see [`docs/contributing-gitflow.md`](docs/contributing-gitflow.md).

## License

[MIT](LICENSE) © sdkurjnk
