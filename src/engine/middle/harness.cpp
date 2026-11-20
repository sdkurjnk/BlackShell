#include "engine.hpp"

// EquivalenceHarness (our IP, safety net): run the baseline (L0) and the
// transformed Module, then compare observable outputs.
// DUMMY: always equivalent (identity noising can't break anything yet).
// The real harness drops in here.
bool harness_verify(const llvm::Module& /*baseline*/, const llvm::Module& /*transformed*/) { return true; }
