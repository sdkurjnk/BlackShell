// Builds the self-contained engine WITHOUT CMake.
//
// Why no CMake: LLVM/Clang's CMake config (find_package) force-restores
// LLVM_LINK_LLVM_DYLIB=ON and its clang imported targets pull the aggregate
// libLLVM dylib in as an interface dep -- so the stock config always links the
// ~200MB shared libs and can't be told to go static (mixing static components
// with that dylib is a duplicate-symbol error). We bypass it: compile with
// `llvm-config --cxxflags`, then raw-link the static component archives
// (`--link-static --libs` + the libclang*.a) so LLVM/Clang end up INSIDE the
// binary. Result: one self-contained executable, no libLLVM/libclang at runtime.
//
// One definition shared by local dev and every CI platform (publish.yml/test.yml
// call this), so the engine can never build differently across platforms again.
//
// Env overrides: LLVM_CONFIG (path to llvm-config), CXX (compiler).

import { execFileSync } from "node:child_process";
import { readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OS = process.platform; // 'win32' | 'linux' | 'darwin'
const EXE = OS === "win32" ? ".exe" : "";
const OUT = "build";
const OBJ = join(OUT, "obj");

const ENGINE_SRC = "src/engine";
const CORE = ["driver", "frontend", "gate", "noising", "harness", "backend"];

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}
function tokens(cmd, args) {
  return sh(cmd, args).split(/\s+/).filter(Boolean);
}

// --- resolve llvm-config (versioned on Linux, brew prefix on macOS) ----------
function findLlvmConfig() {
  if (process.env.LLVM_CONFIG) return process.env.LLVM_CONFIG;
  const cands = ["llvm-config"];
  if (OS === "linux") cands.unshift("llvm-config-23", "/usr/lib/llvm-23/bin/llvm-config");
  if (OS === "darwin") {
    try { cands.unshift(join(sh("brew", ["--prefix", "llvm"]), "bin", "llvm-config")); } catch {}
  }
  for (const c of cands) {
    try { execFileSync(c, ["--version"], { stdio: "ignore" }); return c; } catch {}
  }
  throw new Error("llvm-config not found; set LLVM_CONFIG");
}

const LC = findLlvmConfig();
const CXX = process.env.CXX || (OS === "darwin" ? "clang++" : "g++");

// --- flags -------------------------------------------------------------------
const cxxflags = [
  ...tokens(LC, ["--cxxflags"]),
  "-std=c++17",
  "-ffunction-sections",
  "-fdata-sections",
  `-I${ENGINE_SRC}`,
];

const libdir = sh(LC, ["--libdir"]);
const ldflags = tokens(LC, ["--ldflags"]);
const llvmLibs = tokens(LC, ["--link-static", "--libs", "all"]);
// Windows: `-lzstd.dll` names the import lib; use the static archive instead.
const sysLibs = tokens(LC, ["--link-static", "--system-libs"]).map((t) =>
  t === "-lzstd.dll" ? "-lzstd" : t
);

// Clang has no llvm-config; link its static component archives directly. Skip
// the shared/import libs and the aggregates (libclang-cpp / the C-API libclang),
// whose symbols the fine-grained libclang*.a already provide -> avoid duplicates.
const clangArchives = readdirSync(libdir)
  .filter((f) => /^libclang.*\.a$/.test(f) && !f.endsWith(".dll.a"))
  .filter((f) => f !== "libclang-cpp.a" && f !== "libclang.a")
  .map((f) => join(libdir, f));

// Embed the C++ runtime so the binary is self-contained. macOS has no static
// libc/libc++ (and ld64 has no --start-group), so there it stays dynamic against
// the always-present system libs; Linux keeps glibc dynamic.
const staticRuntime =
  OS === "win32" ? ["-static", "-static-libgcc", "-static-libstdc++"] :
  OS === "linux" ? ["-static-libgcc", "-static-libstdc++"] :
  [];
const stripAndGc = OS === "darwin" ? ["-Wl,-dead_strip"] : ["-Wl,--gc-sections", "-s"];
const groupStart = OS === "darwin" ? [] : ["-Wl,--start-group"];
const groupEnd = OS === "darwin" ? [] : ["-Wl,--end-group"];

// --- compile -----------------------------------------------------------------
mkdirSync(OBJ, { recursive: true });

function compile(src, obj) {
  console.log(`  cc ${src}`);
  execFileSync(CXX, [...cxxflags, "-c", src, "-o", obj], { stdio: "inherit" });
}

const coreObjs = CORE.map((n) => {
  const o = join(OBJ, `${n}.o`);
  compile(join(ENGINE_SRC, `${n}.cpp`), o);
  return o;
});

function link(outName, entryObj) {
  const out = join(OUT, `${outName}${EXE}`);
  console.log(`  ld ${out}`);
  execFileSync(CXX, [
    "-o", out,
    ...coreObjs, entryObj,
    ...staticRuntime, ...stripAndGc, ...ldflags,
    ...groupStart, ...clangArchives, ...llvmLibs, ...groupEnd,
    ...sysLibs,
  ], { stdio: "inherit" });
  return out;
}

// Engine (always) + unit test (--test). Core objects are reused for both.
console.log(`build-engine: ${OS} via ${LC} (${CXX})`);
const mainObj = join(OBJ, "main.o");
compile(join(ENGINE_SRC, "main.cpp"), mainObj);
console.log("built " + link("blackshell-engine", mainObj));

if (process.argv.includes("--test")) {
  const testObj = join(OBJ, "engine_test.o");
  compile("test/engine/engine_test.cpp", testObj);
  console.log("built " + link("blackshell-engine-test", testObj));
}
