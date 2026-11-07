#include "engine.hpp"
#include <cstdio>
#include <string>

static std::string stem(const std::string& path) {
    const size_t s = path.find_last_of("/\\");
    const std::string base = (s == std::string::npos) ? path : path.substr(s + 1);
    const size_t d = base.find_last_of('.');
    return (d == std::string::npos) ? base : base.substr(0, d);
}

// Gate verdict only (preview before staging). Dummy gate accepts everything.
int driver_check(const std::string& src) {
    if (!gate_check(src)) { std::printf("gate.reject %s\n", src.c_str()); return EXIT_REJECT; }
    std::printf("gate.ok %s\n", src.c_str());
    return EXIT_OK;
}

// Seal pipeline: frontend -> gate -> noising -> backend -> artifact. Emits
// structured tokens on stdout; the Launcher renders them.
int driver_seal(const std::string& src) {
    const std::string base = stem(src), ir = base + ".ll", obj = base + ".o";
    if (!frontend_compile(src, ir)) { std::printf("frontend.failed %s\n", src.c_str()); return EXIT_ERR; }
    if (!gate_check(ir)) { std::remove(ir.c_str()); std::printf("gate.reject %s\n", src.c_str()); return EXIT_REJECT; }
    if (!noising_apply(ir)) { std::remove(ir.c_str()); std::printf("noising.failed %s\n", src.c_str()); return EXIT_ERR; }
    if (!backend_emit(ir, obj)) { std::remove(ir.c_str()); std::printf("backend.failed %s\n", src.c_str()); return EXIT_ERR; }
    std::remove(ir.c_str());
    std::printf("sealed %s %s\n", src.c_str(), obj.c_str());
    return EXIT_OK;
}
