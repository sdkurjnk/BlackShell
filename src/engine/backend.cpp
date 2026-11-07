#include "engine.hpp"
#include <cstdlib>

// Backend (LLVM / llc): compile LLVM IR to an object file. BLACK BOX — real LLVM.
// shortcut: std::system with naive quoting; upgrade to argv exec if needed.
bool backend_emit(const std::string& ir, const std::string& obj_out) {
    const std::string cmd = "llc -filetype=obj \"" + ir + "\" -o \"" + obj_out + "\"";
    return std::system(cmd.c_str()) == 0;
}
