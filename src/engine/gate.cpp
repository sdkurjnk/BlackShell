#include "engine.hpp"

// Gate (our IP): §5 condition 1 isolation check (no external memory sharing).
// DUMMY: accept-all. Real static analysis over the IR drops in here.
bool gate_check(const std::string& /*ir*/) { return true; }
