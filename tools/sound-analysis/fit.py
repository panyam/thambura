"""Fits the jawari voice's bloom to a recording (docs/sound-analysis.md, "Fitting").

    python fit.py ../../recordings/tambura-C.mp3 --sa 131.05

Measures the first string's and the low Sa's band tables in the recording,
then searches the parameters of a simplified model of the jawari voice in
web/src/engine/tambura.ts (renderPartial and its formant) for the closest
match, by differential evolution. The model is computed from the harmonics'
amplitudes directly, so a fit takes seconds; the fitted numbers go into
pluckVoice by hand, and pnpm render-mix plus compare.py check the real thing.

The model per harmonic k at frequency fk, t seconds after the pluck:
    amplitude = |sin(pi k pluckAt)| / k^rolloff * exp(-t / tau_k) * 10^(bloom_k(t) / 20)
    tau_k     = ring / ln(1000) / (1 + damping (k - 1))
    bloom_k   = depth * gaussian(log2(fk / centre) / octaves) * shape(t)
    shape(t)  = (1 - exp(-t / rise)) * (rest + (1 - rest) exp(-((t - hold)+ / fall)^2))
"""

from __future__ import annotations

import argparse

import numpy as np
from scipy.optimize import differential_evolution

import soundlab as sl

TIMES = np.array([0.1, 0.2, 0.4, 0.7, 1.0, 1.3, 1.6, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5])
FLOOR = -45  # dB; quieter cells are mostly noise and other strings
# name, low, high. The low Sa gets its own bloom depth: in the recording it
# blooms much less, relative to its strong fundamental, than the first string.
PARAMS = [
    ("rolloff", 0.8, 2.5),
    ("ring", 8, 60),
    ("damping", 0, 0.1),
    ("centre", 600, 2500),
    ("octaves", 0.3, 1.5),
    ("depth", 0, 40),
    ("depth_low", 0, 40),
    ("rise", 0.05, 2.5),
    ("hold", 0.3, 2.0),
    ("fall", 0.2, 1.5),
]
PLUCK_AT = 0.1 + 0.001 * np.sqrt(2)


def model_bands(p: dict, f0: float, ks: list[int], depth: float) -> np.ndarray:
    tt = np.linspace(0, TIMES.max() + 0.3, 481)
    out = np.zeros((len(sl.BANDS), len(tt)))
    shape = (1 - np.exp(-tt / p["rise"])) * np.exp(-((np.maximum(0, tt - p["hold"]) / p["fall"]) ** 2))
    for k in ks:
        fk = k * f0
        base = abs(np.sin(np.pi * k * PLUCK_AT)) / k ** p["rolloff"]
        tau = p["ring"] / np.log(1000) / (1 + p["damping"] * (k - 1))
        bloom = depth * np.exp(-0.5 * (np.log2(fk / p["centre"]) / p["octaves"]) ** 2) * shape
        amp = base * np.exp(-tt / tau) * 10 ** (bloom / 20)
        for b, (lo, hi) in enumerate(sl.BANDS):
            if lo <= fk < hi:
                out[b] += amp**2
    # Smear like the analysis window (186 ms), so the attack compares fairly.
    ker = np.hanning(17)
    ker /= ker.sum()
    out = np.array([np.convolve(row, ker, "same") for row in out])
    idx = np.searchsorted(tt, TIMES)
    return 10 * np.log10(out[:, idx] + 1e-20) - 10 * np.log10(out.sum(axis=0).max())


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("--sa", type=float, required=True)
    ap.add_argument("--first", type=float, default=0.75)
    ap.add_argument("--iterations", type=int, default=200)
    args = ap.parse_args()

    a = sl.load(args.audio)
    pitches = sl.string_pitches(args.sa, args.first)
    spec = sl.spectrogram(a)
    plucks = sl.detect_plucks(a, spec, pitches)
    own = sl.string_harmonics(pitches)
    targets = {
        "first": (pitches[0], own["first"], sl.string_curves(spec, pitches[0], own["first"],
                                                             sl.steady(plucks.times["first"], a), TIMES).bands),
        "low Sa": (pitches[3], own["low Sa"], sl.string_curves(spec, pitches[3], own["low Sa"],
                                                               sl.steady(plucks.times["low Sa"], a), TIMES).bands),
    }

    def unpack(x) -> dict:
        return {name: v for (name, _, _), v in zip(PARAMS, x)}

    def loss(x) -> float:
        p = unpack(x)
        err = 0.0
        for s, (f0, ks, rec) in targets.items():
            m = model_bands(p, f0, ks, p["depth_low"] if s == "low Sa" else p["depth"])
            err += np.mean((np.maximum(m, FLOOR) - np.maximum(rec, FLOOR)) ** 2)
        return err / len(targets)

    res = differential_evolution(loss, [(lo, hi) for _, lo, hi in PARAMS], seed=1, maxiter=args.iterations,
                                 popsize=20, tol=1e-8, polish=True)
    p = unpack(res.x)
    print(f"fit error {np.sqrt(res.fun):.1f} dB RMS over {len(sl.BANDS)} bands x {len(TIMES)} times\n")
    for name, lo, hi in PARAMS:
        edge = "  (at its bound)" if min(abs(p[name] - lo), abs(p[name] - hi)) < 1e-3 * (hi - lo) else ""
        print(f"  {name:10s} {p[name]:8.3f}{edge}")
    for s, (f0, ks, rec) in targets.items():
        m = model_bands(p, f0, ks, p["depth_low"] if s == "low Sa" else p["depth"])
        print(f"\n{s}: model / recording, dB re the string's loudest moment")
        print("  band       " + "".join(f"{t:6.1f}" for t in TIMES))
        for (lo, hi), mr, rr in zip(sl.BANDS, m, rec):
            print(f"  {lo:4d}-{hi:<5d} " + "".join(f"{v:6.0f}" for v in mr))
            print(f"  {'':10s} " + "".join(f"{v:6.0f}" for v in rr))


if __name__ == "__main__":
    main()
