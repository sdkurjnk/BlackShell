#include "engine.hpp"

#include "clang/CodeGen/CodeGenAction.h"
#include "clang/Frontend/CompilerInstance.h"
#include "clang/Frontend/CompilerInvocation.h"
#include "llvm/IR/Module.h"
#include "llvm/TargetParser/Host.h"

// Frontend: embed Clang to compile a C source file to an in-memory Module.
// cc1 args are parsed into the invocation.
// EmitLLVMOnlyAction runs codegen into the caller's LLVMContext,
// which we then take ownership of via takeModule().
std::unique_ptr<llvm::Module> frontend_compile(const std::string& src, llvm::LLVMContext& ctx) {
    clang::CompilerInstance ci;
    ci.createDiagnostics();

    const std::string triple = llvm::sys::getDefaultTargetTriple();
    const char* args[] = {"-triple", triple.c_str(), "-x", "c", src.c_str()};

    if (!clang::CompilerInvocation::CreateFromArgs(ci.getInvocation(), args, ci.getDiagnostics())) {
        return nullptr;
    }

    clang::EmitLLVMOnlyAction action(&ctx);

    if (!ci.ExecuteAction(action)) {
        return nullptr;
    }

    return action.takeModule();
}
