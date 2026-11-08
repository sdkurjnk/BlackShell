// Engine unit tests (C++) — one per component: the three dummy IP primitives,
// the two LLVM black-box primitives, and both driver entry points. Links the
// primitive TUs but NOT main.cpp (this file owns main). Run from a temp cwd with
// the source fixture path as argv[1]; the JS wrapper (test/engine.test.js) does that.
#include "engine.hpp"
#include <cstdio>
#include <filesystem>
#include <string>

namespace fs = std::filesystem;
static int failures = 0;

static void check(bool cond, const char* name) {
    std::printf("%s  %s\n", cond ? "ok  " : "FAIL", name);
    if (!cond) ++failures;
}

static bool nonempty(const std::string& p) {
    std::error_code ec;
    return fs::exists(p, ec) && fs::file_size(p, ec) > 0;
}

int main(int argc, char** argv) {
    if (argc < 2) { std::printf("usage: engine-test <source.c>\n"); return 2; }
    const std::string src = argv[1];
    const std::string obj = fs::path(src).stem().string() + ".o";  // driver_enshell writes <stem>.o in cwd

    // --- our IP primitives (dummies) ---
    check(gate_check(src), "gate_check: dummy accept-all returns true");
    check(noising_apply(src), "noising_apply: dummy identity returns true");
    check(harness_verify(src, src), "harness_verify: dummy equivalent returns true");

    // --- LLVM black-box primitives ---
    check(frontend_compile(src, "unit.ll") && nonempty("unit.ll"), "frontend_compile: clang source -> .ll");
    check(backend_emit("unit.ll", "unit.o") && fs::exists("unit.o"), "backend_emit: llc .ll -> .o");

    // --- driver (sequencer) ---
    check(driver_check(src) == EXIT_OK, "driver_check: dummy gate -> EXIT_OK");
    check(driver_enshell(src) == EXIT_OK, "driver_enshell: full pipeline -> EXIT_OK");
    check(fs::exists(obj), "driver_enshell: produces <stem>.o artifact");

    std::printf("\n%d failure(s)\n", failures);
    return failures == 0 ? 0 : 1;
}
