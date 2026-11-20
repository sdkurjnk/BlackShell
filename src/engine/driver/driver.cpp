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

// Gate verdict only (preview before staging).
// Compiles to IR, then gates it.
Status driver_check(const std::string& src) {
    llvm::LLVMContext ctx;
    std::unique_ptr<llvm::Module> m = frontend_compile(src, ctx);

    if (!m) {
        return Status::FrontendFailed;
    }

    if (!gate_check(*m)) {
        return Status::GateReject;
    }

    return Status::GateOk;
}

// Enshell pipeline as a handoff chain:
// each stage does its work, then calls the next stage itself
// (frontend -> gate -> optimize -> noising -> codegen -> harness).
// After optimization the flow forks: pure keeps the optimized IR, the noised
// branch goes through noising; the code generator emits both objects and the
// harness compares them. noised.o is the sealed artifact, pure.o is scratch.
// A stage hands the next only the data it produced;
// its own config is captured here at assembly, never relayed through stages that don't use it.
// Each stage returns a Status; the boundary turns that into a token and exit code.
// Assembled bottom-up so each stage can capture the next.
Status driver_enshell(const std::string& src, const std::vector<std::string>& levels, const std::string& out) {
    const std::string obj = out.empty() ? stem(src) + ".o" : out;
    const std::string pureObj = obj + ".pure.o";   // scratch for the harness
    llvm::LLVMContext ctx;

    // Harness (our IP, dummy): compare the two emitted objects.
    auto harness = [](const std::string& pure, const std::string& noised) -> Status {
        if (!harness_verify(pure, noised)) {
            return Status::VerifyBroken;
        }

        return Status::Sealed;
    };

    // Code Generator (LLVM): emit both objects, verify, then drop the scratch.
    // noised.o is the sealed artifact; pure.o exists only for the harness.
    auto codegen = [&obj, &pureObj, &harness](llvm::Module& pure, llvm::Module& noised) -> Status {
        if (!backend_emit(pure, pureObj)) {
            return Status::BackendFailed;
        }

        if (!backend_emit(noised, obj)) {
            std::remove(pureObj.c_str());
            return Status::BackendFailed;
        }

        const Status s = harness(pureObj, obj);
        std::remove(pureObj.c_str());
        return s;
    };

    // Noising (our IP, dummy identity): transforms only the noised branch.
    auto noising = [&levels, &codegen](llvm::Module& pure, llvm::Module& noised) -> Status {
        if (!noising_apply(noised, levels)) {
            return Status::NoisingFailed;
        }

        return codegen(pure, noised);
    };

    // Optimization (LLVM): optimize in place, then fork -- pure keeps the
    // optimized, pre-noise IR; the noised branch carries on.
    auto optimize = [&noising](llvm::Module& m) -> Status {
        optimize_apply(m);
        std::unique_ptr<llvm::Module> pure = llvm::CloneModule(m);
        return noising(*pure, m);
    };

    // Gate (our IP, dummy accept-all).
    auto gate = [&optimize](llvm::Module& m) -> Status {
        if (!gate_check(m)) {
            return Status::GateReject;
        }

        return optimize(m);
    };

    std::unique_ptr<llvm::Module> m = frontend_compile(src, ctx);

    if (!m) {
        return Status::FrontendFailed;
    }

    return gate(*m);
}
