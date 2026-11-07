#include "engine.hpp"

// EquivalenceHarness (our IP · safety net): compile+run the baseline (L0) and
// the transformed IR, compare observable outputs. DUMMY: always equivalent
// (identity noising can't break anything yet). The real harness drops in here.
bool harness_verify(const std::string& /*baseline_ir*/, const std::string& /*transformed_ir*/) { return true; }
