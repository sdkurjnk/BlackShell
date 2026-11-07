// BlackShell engine (C++ skeleton). The Driver dispatches commands and
// sequences the seal pipeline (load -> gate -> noise -> emit) per unit.
//
// Hybrid roles (docs/Architecture.md §5): the TS Launcher owns CLI parsing,
// the command set and message rendering; the engine returns STRUCTURED result
// tokens (never rendered strings), which the Launcher renders.
//
// Compilation is REAL (clang frontend -> llc backend); the processing passes
// are DUMMY: gate = accept-all, noising = identity (the .ll is passed through
// untouched). Real passes land in a later branch (libLLVM in-process).
// shortcut: std::system with naive quoting (local dev tool, user's own files);
// upgrade to CreateProcess/argv exec if quoting/injection matters.
#include <cstdio>
#include <cstdlib>
#include <string>

enum { EXIT_OK = 0, EXIT_ERR = 1, EXIT_REJECT = 2 };

static int sh(const std::string& cmd) { return std::system(cmd.c_str()); }

static std::string stem(const std::string& path) {
    size_t s = path.find_last_of("/\\");
    std::string base = (s == std::string::npos) ? path : path.substr(s + 1);
    size_t d = base.find_last_of('.');
    return (d == std::string::npos) ? base : base.substr(0, d);
}

// Dummy gate: accept-all. The §5 cond.1 isolation check lands later.
static bool gate_ok(const std::string& /*src*/) { return true; }

static int cmd_check(const std::string& src) {
    if (!gate_ok(src)) { std::printf("gate.reject %s\n", src.c_str()); return EXIT_REJECT; }
    std::printf("gate.ok %s\n", src.c_str());
    return EXIT_OK;
}

// seal: frontend(clang) src -> IR, gate(dummy), noise(identity), backend(llc) -> .o
static int cmd_seal(const std::string& src) {
    const std::string base = stem(src);
    const std::string ll = base + ".ll", obj = base + ".o";

    if (sh("clang -S -emit-llvm \"" + src + "\" -o \"" + ll + "\"") != 0) {
        std::printf("frontend.failed %s\n", src.c_str());
        return EXIT_ERR;
    }
    if (!gate_ok(src)) {  // gate runs on the IR; dummy accepts
        std::remove(ll.c_str());
        std::printf("gate.reject %s\n", src.c_str());
        return EXIT_REJECT;
    }
    // noising = identity: the .ll is left untouched (no real pass yet)
    if (sh("llc -filetype=obj \"" + ll + "\" -o \"" + obj + "\"") != 0) {
        std::printf("backend.failed %s\n", src.c_str());
        return EXIT_ERR;
    }
    std::remove(ll.c_str());
    std::printf("sealed %s %s\n", src.c_str(), obj.c_str());
    return EXIT_OK;
}

int main(int argc, char** argv) {
    if (argc < 2) { std::printf("usage\n"); return EXIT_OK; }
    const std::string cmd = argv[1];
    if (cmd == "check" || cmd == "seal") {
        if (argc < 3) { std::fprintf(stderr, "arg.one_positional\n"); return EXIT_ERR; }
        return (cmd == "check") ? cmd_check(argv[2]) : cmd_seal(argv[2]);
    }
    std::printf("cmd.unknown %s\n", cmd.c_str());
    return EXIT_ERR;
}
