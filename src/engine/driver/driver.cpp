#include "engine.hpp"

#include "llvm/IR/LLVMContext.h"
#include "llvm/IR/Module.h"
#include "llvm/Transforms/Utils/Cloning.h"

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

// Enshell pipeline as a handoff chain: each stage does its work, then calls the
// next stage itself (frontend -> gate -> noising -> harness -> backend).
// A stage hands the next only the data it produced; its own config is captured
// here at assembly, never relayed through stages that don't use it.
// Each stage returns a Status; the boundary turns that into a token and exit code.
// Assembled bottom-up so each stage can capture the next.
Status driver_enshell(const std::string& src, const std::vector<std::string>& levels, const std::string& out) {
    const std::string obj = out.empty() ? stem(src) + ".o" : out;
    llvm::LLVMContext ctx;

    auto backend = [&obj](llvm::Module& m) -> Status {
        if (!backend_emit(m, obj)) {
            return Status::BackendFailed;
        }

        return Status::Sealed;
    };

    auto harness = [&backend](llvm::Module& baseline, llvm::Module& m) -> Status {
        if (!harness_verify(baseline, m)) {
            return Status::VerifyBroken;
        }

        return backend(m);
    };

    auto noising = [&levels, &harness](llvm::Module& m) -> Status {
        // L0 baseline: snapshot before noising so the harness compares against
        // the pre-noise Module (identity noising makes them equal for now).
        std::unique_ptr<llvm::Module> baseline = llvm::CloneModule(m);

        if (!noising_apply(m, levels)) {
            return Status::NoisingFailed;
        }

        return harness(*baseline, m);
    };

    auto gate = [&noising](llvm::Module& m) -> Status {
        if (!gate_check(m)) {
            return Status::GateReject;
        }

        return noising(m);
    };

    std::unique_ptr<llvm::Module> m = frontend_compile(src, ctx);

    if (!m) {
        return Status::FrontendFailed;
    }

    return gate(*m);
}
