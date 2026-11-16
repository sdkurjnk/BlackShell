#include "engine.hpp"

#include "llvm/IR/LLVMContext.h"
#include "llvm/IR/Module.h"
#include "llvm/Transforms/Utils/Cloning.h"

#include <cstdio>
#include <string>

static std::string stem(const std::string& path) {
    const size_t s = path.find_last_of("/\\");
    const std::string base = (s == std::string::npos) ? path : path.substr(s + 1);
    const size_t d = base.find_last_of('.');
    return (d == std::string::npos) ? base : base.substr(0, d);
}

// Gate verdict only (preview before staging). Compiles to IR, then gates it.
int driver_check(const std::string& src) {
    llvm::LLVMContext ctx;
    std::unique_ptr<llvm::Module> m = frontend_compile(src, ctx);
    if (!m) { std::printf("frontend.failed %s\n", src.c_str()); return EXIT_ERR; }
    if (!gate_check(*m)) { std::printf("gate.reject %s\n", src.c_str()); return EXIT_REJECT; }
    std::printf("gate.ok %s\n", src.c_str());
    return EXIT_OK;
}

// Enshell pipeline: frontend -> gate -> noising -> backend -> artifact. Emits
// structured tokens on stdout; the Launcher renders them.
int driver_enshell(const std::string& src, const std::vector<std::string>& levels) {
    const std::string obj = stem(src) + ".o";
    llvm::LLVMContext ctx;
    std::unique_ptr<llvm::Module> m = frontend_compile(src, ctx);
    if (!m) { std::printf("frontend.failed %s\n", src.c_str()); return EXIT_ERR; }
    if (!gate_check(*m)) { std::printf("gate.reject %s\n", src.c_str()); return EXIT_REJECT; }
    // L0 baseline: snapshot before noising so the harness compares against the
    // pre-noise Module (identity noising makes them equal for now).
    std::unique_ptr<llvm::Module> baseline = llvm::CloneModule(*m);
    if (!noising_apply(*m, levels)) { std::printf("noising.failed %s\n", src.c_str()); return EXIT_ERR; }
    if (!harness_verify(*baseline, *m)) { std::printf("verify.broken %s\n", src.c_str()); return EXIT_ERR; }
    if (!backend_emit(*m, obj)) { std::printf("backend.failed %s\n", src.c_str()); return EXIT_ERR; }
    std::printf("sealed %s %s\n", src.c_str(), obj.c_str());
    return EXIT_OK;
}
