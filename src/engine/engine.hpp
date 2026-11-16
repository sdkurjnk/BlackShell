#pragma once
#include <memory>
#include <string>
#include <vector>

namespace llvm { class Module; class LLVMContext; }

// BlackShell engine — contract shared across the enshell pipeline.
// The Driver sequences orthogonal primitives (load -> gate -> noise -> emit).
// Each primitive lives in its own translation unit so a real implementation
// drops in without touching the others (docs/Architecture.md §5).
//
// IR is handed between stages as an in-memory llvm::Module: the frontend embeds
// Clang (EmitLLVMOnlyAction) and the backend embeds LLVM (TargetMachine), so the
// pipeline is self-contained — no clang/llc on the user's PATH (#15).

enum ExitCode { EXIT_OK = 0, EXIT_ERR = 1, EXIT_REJECT = 2 };

// --- primitives (orthogonal; see frontend/gate/noising/backend .cpp) ---
// Clang: C source file -> in-memory Module (nullptr on failure). The caller owns
// the LLVMContext and must outlive the returned Module.
std::unique_ptr<llvm::Module> frontend_compile(const std::string& src, llvm::LLVMContext& ctx);
bool gate_check(const llvm::Module& m);                 // §5 cond.1; dummy accept-all
// levels = the orthogonal dials to apply (e.g. {"L1","L3"}); empty = L0 identity.
bool noising_apply(llvm::Module& m, const std::vector<std::string>& levels);  // L1-L3 in place; dummy identity
bool harness_verify(const llvm::Module& baseline, const llvm::Module& transformed);  // L0 vs transformed; dummy = equivalent
bool backend_emit(llvm::Module& m, const std::string& obj_out);  // LLVM: Module -> object

// --- driver (sequences the primitives) ---
int driver_check(const std::string& src);   // gate verdict only
int driver_enshell(const std::string& src, const std::vector<std::string>& levels); // full enshell pipeline
