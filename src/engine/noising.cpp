#include "engine.hpp"

// Noising (our IP): L1/L2 (OLLVM fork) + L3 (carry-sensitive MBA).
// DUMMY: identity — the IR passes through untouched. Real passes link libLLVM
// and transform the Module in place.
bool noising_apply(const std::string& /*ir*/) { return true; }
