"""Black-Shell PoC engine (internal execution layer).

LLVM-free toy pipeline: toy IR + interpreter + dummy passes, wired end to end
so the layer contracts (docs/interfaces/) can be locked in code before the real
gate / noising / LLVM backend land. See docs/interfaces/README.md.
"""
