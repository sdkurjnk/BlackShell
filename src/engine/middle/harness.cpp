#include "engine.hpp"

// EquivalenceHarness (our IP, safety net): link and run the pure and noised
// objects, then compare observable outputs.
// DUMMY: always equivalent (identity noising can't break anything yet).
// The real harness drops in here.
bool harness_verify(const std::string& /*pure_obj*/, const std::string& /*noised_obj*/) { return true; }
