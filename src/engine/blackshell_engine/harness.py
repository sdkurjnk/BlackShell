"""Equivalence harness (docs/interfaces/05-verification-harness.md).

Runs baseline (L0) and candidate (transformed) through the interpreter on the
same inputs and compares observable outputs (`returns`) only — never internal
registers / instruction count / path, since noising changes exactly those.

Sample-based: absence of a counterexample, NOT an equivalence proof.
"""

from .interp import run


def verify(baseline, candidate, inputs_list):
    mismatches = []
    for inputs in inputs_list:
        expected = run(baseline, inputs)
        actual = run(candidate, inputs)
        if expected != actual:
            mismatches.append(
                {"input": inputs, "expected": expected, "actual": actual}
            )
    return {
        "equivalent": not mismatches,
        "mismatches": mismatches,
        "note": "sample-based (counterexample absence), not an equivalence proof",
    }


def sample_inputs(module, n=6):
    """Deterministic input vectors to exercise the harness in the PoC."""
    pool = [0, 1, 2, 3, 7, 42]
    params = module["params"]
    return [
        {p: pool[(i + j) % len(pool)] for j, p in enumerate(params)}
        for i in range(n)
    ]
