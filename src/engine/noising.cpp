#include "engine.hpp"

// Noising (our IP): L1/L2 (OLLVM fork) + L3 (carry-sensitive MBA).
// DUMMY: identity — the Module passes through untouched. Real passes transform
// the Module in place.
bool noising_apply(llvm::Module& /*m*/) { return true; }
