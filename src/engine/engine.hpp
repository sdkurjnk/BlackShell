#pragma once
#include <string>

// BlackShell engine — contract shared across the seal pipeline.
// The Driver sequences orthogonal primitives (load -> gate -> noise -> emit).
// Each primitive lives in its own translation unit so a real implementation
// drops in without touching the others (docs/Architecture.md §5).
//
// IR is handed between stages as a file path for now (clang/llc run as
// subprocesses). shortcut: file-path handoff; upgrade to an in-memory IR handle
// when the passes link libLLVM in-process.

enum ExitCode { EXIT_OK = 0, EXIT_ERR = 1, EXIT_REJECT = 2 };

// --- primitives (orthogonal; see frontend/gate/noising/backend .cpp) ---
bool frontend_compile(const std::string& src, const std::string& ir_out);  // clang: source -> IR
bool gate_check(const std::string& ir);                                     // §5 cond.1; dummy accept-all
bool noising_apply(const std::string& ir);                                  // L1-L3; dummy identity
bool backend_emit(const std::string& ir, const std::string& obj_out);       // llc: IR -> object

// --- driver (sequences the primitives) ---
int driver_check(const std::string& src);   // gate verdict only
int driver_seal(const std::string& src);    // full seal pipeline
