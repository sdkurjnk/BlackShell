#include "engine.hpp"
#include <cstdlib>

// Frontend (LLVM / clang): compile source to LLVM IR. BLACK BOX — real LLVM.
// shortcut: std::system with naive quoting (local dev tool, user's own files);
// upgrade to CreateProcess/argv exec if quoting/injection matters.
bool frontend_compile(const std::string& src, const std::string& ir_out) {
    const std::string cmd = "clang -S -emit-llvm \"" + src + "\" -o \"" + ir_out + "\"";
    return std::system(cmd.c_str()) == 0;
}
