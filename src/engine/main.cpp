#include "engine.hpp"
#include <cstdio>
#include <string>

// Entry point: parse the command and hand it to the Driver. The TS Launcher
// owns real CLI parsing and message rendering; this is the engine's thin
// dispatch, returning structured tokens on stdout (docs/Architecture.md §5).
int main(int argc, char** argv) {
    if (argc < 2) { std::printf("usage\n"); return EXIT_OK; }
    const std::string cmd = argv[1];
    if (cmd == "check" || cmd == "seal") {
        if (argc < 3) { std::printf("arg.one_positional\n"); return EXIT_ERR; }
        return (cmd == "check") ? driver_check(argv[2]) : driver_seal(argv[2]);
    }
    std::printf("cmd.unknown %s\n", cmd.c_str());
    return EXIT_ERR;
}
