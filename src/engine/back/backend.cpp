#include "engine.hpp"

#include "llvm/IR/LegacyPassManager.h"
#include "llvm/IR/Module.h"
#include "llvm/MC/TargetRegistry.h"
#include "llvm/Support/CodeGen.h"
#include "llvm/Support/FileSystem.h"
#include "llvm/Support/TargetSelect.h"
#include "llvm/Support/raw_ostream.h"
#include "llvm/Target/TargetMachine.h"
#include "llvm/Target/TargetOptions.h"
#include "llvm/TargetParser/Host.h"

#include <optional>
#include <system_error>

// Backend: embed LLVM to lower a Module to a native object file (replaces llc).
// Host target only — the frontend tags the Module with the host triple.
bool backend_emit(llvm::Module& m, const std::string& obj_out) {
    static const bool inited = [] {
        llvm::InitializeNativeTarget();
        llvm::InitializeNativeTargetAsmParser();
        llvm::InitializeNativeTargetAsmPrinter();
        return true;
    }();
    (void)inited;

    llvm::Triple triple = m.getTargetTriple();
    if (triple.getTriple().empty()) {
        triple = llvm::Triple(llvm::sys::getDefaultTargetTriple());
        m.setTargetTriple(triple);
    }

    std::string err;
    const llvm::Target* target = llvm::TargetRegistry::lookupTarget(triple, err);

    if (!target) {
        return false;
    }

    llvm::TargetOptions opts;
    std::unique_ptr<llvm::TargetMachine> tm(target->createTargetMachine(
        triple, "generic", "", opts, std::optional<llvm::Reloc::Model>()));

    if (!tm) {
        return false;
    }

    m.setDataLayout(tm->createDataLayout());

    std::error_code ec;
    llvm::raw_fd_ostream out(obj_out, ec, llvm::sys::fs::OF_None);

    if (ec) {
        return false;
    }

    llvm::legacy::PassManager pm;
    if (tm->addPassesToEmitFile(pm, out, nullptr, llvm::CodeGenFileType::ObjectFile)) {
        return false;
    }

    pm.run(m);
    out.flush();
    return true;
}
