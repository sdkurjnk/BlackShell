#include "engine.hpp"

// Gate (our IP): the isolation check — no external memory sharing.
// DUMMY: accept-all.
// Real static analysis over the Module drops in here.
bool gate_check(const llvm::Module& /*m*/) { return true; }
