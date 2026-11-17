#include "engine.hpp"
#include <cstdio>
#include <string>
#include <vector>

// Split "L1,L2" into {"L1","L2"}; "" -> {} (L0 identity).
static std::vector<std::string> split_csv(const std::string& s) {
    std::vector<std::string> out;
    for (size_t start = 0; start < s.size();) {
        const size_t c = s.find(',', start);
        const size_t end = (c == std::string::npos) ? s.size() : c;
        out.push_back(s.substr(start, end - start));
        start = end + 1;
    }
    return out;
}

// Entry point: parse the command and hand it to the Driver. The TS Launcher
// owns real CLI parsing and message rendering; this is the engine's thin
// dispatch, returning structured tokens on stdout (docs/Architecture.md §5).
int main(int argc, char** argv) {
    if (argc < 2) { std::printf("usage\n"); return EXIT_OK; }
    const std::string cmd = argv[1];
    if (cmd == "check" || cmd == "enshell") {
        if (argc < 3) { std::printf("arg.one_positional\n"); return EXIT_ERR; }
        const std::string src = argv[2];
        if (cmd == "check") { return driver_check(src); }
        // enshell [--level L1,L2]: the Launcher forwards the staged unit's levels.
        std::vector<std::string> levels;
        if (argc >= 5 && std::string(argv[3]) == "--level") { levels = split_csv(argv[4]); }
        return driver_enshell(src, levels);
    }
    std::printf("cmd.unknown %s\n", cmd.c_str());
    return EXIT_ERR;
}
