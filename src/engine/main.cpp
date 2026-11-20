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

// Status -> the bare wire token.
// The engine emits only this code; the Launcher renders the user-facing message,
// filling src/obj from its own staged unit.
static const char* status_token(Status s) {
    switch (s) {
        case Status::Sealed:           return "sealed";
        case Status::GateOk:           return "gate.ok";
        case Status::GateReject:       return "gate.reject";
        case Status::FrontendFailed:   return "frontend.failed";
        case Status::NoisingFailed:    return "noising.failed";
        case Status::VerifyBroken:     return "verify.broken";
        case Status::BackendFailed:    return "backend.failed";
        case Status::ArgOnePositional: return "arg.one_positional";
        case Status::CmdUnknown:       return "cmd.unknown";
        case Status::Usage:            return "usage";
    }

    return "cmd.unknown";
}

// Status -> the process exit code.
// No default: a new Status must be classified here, or -Wswitch flags it.
static int status_exit(Status s) {
    switch (s) {
        case Status::Sealed:
        case Status::GateOk:
        case Status::Usage:
            return EXIT_OK;
        case Status::GateReject:
            return EXIT_REJECT;
        case Status::FrontendFailed:
        case Status::NoisingFailed:
        case Status::VerifyBroken:
        case Status::BackendFailed:
        case Status::ArgOnePositional:
        case Status::CmdUnknown:
            return EXIT_ERR;
    }

    return EXIT_ERR;
}

// Parse the command and hand it to the Driver, yielding one Status.
// The TS Launcher owns real CLI parsing and message rendering;
// this is the engine's thin dispatch.
static Status dispatch(int argc, char** argv) {
    if (argc < 2) {
        return Status::Usage;
    }

    const std::string cmd = argv[1];

    if (cmd != "check" && cmd != "enshell") {
        return Status::CmdUnknown;
    }

    if (argc < 3) {
        return Status::ArgOnePositional;
    }

    const std::string src = argv[2];

    if (cmd == "check") {
        return driver_check(src);
    }

    // enshell [--level L1,L2] [--out path]:
    // the Launcher forwards the staged unit's levels and (if given via `add --name`) the object path to write.
    std::vector<std::string> levels;
    std::string out;

    for (int i = 3; i + 1 < argc; i += 2) {
        const std::string flag = argv[i];

        if (flag == "--level") {
            levels = split_csv(argv[i + 1]);
        }
        else if (flag == "--out") {
            out = argv[i + 1];
        }
    }

    return driver_enshell(src, levels, out);
}

// Entry point and engine boundary: turn the dispatch Status into a bare wire
// token on stdout and a process exit code.
int main(int argc, char** argv) {
    const Status s = dispatch(argc, argv);
    std::printf("%s\n", status_token(s));
    return status_exit(s);
}
