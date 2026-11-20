// Engine unit tests (C++) — one per component: the frontend/backend LLVM
// primitives, the three dummy IP primitives, and both driver entry points. Links
// the primitive TUs but NOT main.cpp (this file owns main). Run from a temp cwd
// with the source fixture path as argv[1]; the JS wrapper (test/engine.test.js) does that.
#include "engine.hpp"
#include "llvm/IR/LLVMContext.h"
#include "llvm/IR/Module.h"
#include <cstdio>
#include <filesystem>
#include <memory>
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

    // --- frontend (embedded Clang) ---
    llvm::LLVMContext ctx;
    std::unique_ptr<llvm::Module> m = frontend_compile(src, ctx);
    check(m != nullptr, "frontend_compile: C source -> Module");

    if (m) {
        // --- our IP primitives (dummies) operate on the Module ---
        check(gate_check(*m), "gate_check: dummy accept-all returns true");
        check(noising_apply(*m, {"L1", "L2"}), "noising_apply: dummy identity carries levels, returns true");
        check(harness_verify(*m, *m), "harness_verify: dummy equivalent returns true");
        // --- backend (embedded LLVM); consumes the Module last ---
        check(backend_emit(*m, "unit.o") && nonempty("unit.o"), "backend_emit: Module -> .o");
    }

    // --- driver (sequencer) ---
    check(driver_check(src) == Status::GateOk, "driver_check: dummy gate -> GateOk");
    check(driver_enshell(src, {"L3"}) == Status::Sealed, "driver_enshell: full pipeline -> Sealed");
    check(fs::exists(obj), "driver_enshell: produces <stem>.o artifact");

    std::printf("\n%d failure(s)\n", failures);
    return failures == 0 ? 0 : 1;
}
