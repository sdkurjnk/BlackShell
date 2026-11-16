#include "engine.hpp"

// Noising (our IP): L1/L2 (OLLVM fork) + L3 (carry-sensitive MBA).
// `levels` are orthogonal, composable dials — NOT a ladder (L3 does not imply
// L1+L2) and never a single dial; the real passes apply exactly the selected set.
// DUMMY: identity — the Module passes through untouched, levels ignored.
// shortcut: levels are taken raw (no validation / order / de-dup), decide those
// rules when the first real pass lands.
bool noising_apply(llvm::Module& /*m*/, const std::vector<std::string>& /*levels*/) { return true; }
