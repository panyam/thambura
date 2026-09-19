"""Prints the measurements for one tambura recording or render.

    python analyse.py ../../recordings/tambura-C.mp3 --sa 131.05
    python analyse.py ../../recordings/renders/jawari.wav

A render from `pnpm render-mix` brings its own pitches and pluck times (the
JSON beside it). A recording needs Sa in Hz (--sa; the strongest low peaks
from the first section below will show it) and, if its first string isn't
Pa, --first with the swara's ratio to Sa halved (Ma: 0.667, Ni: 0.9375).
"""

import argparse
from pathlib import Path

import numpy as np

import soundlab as sl


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("--sa", type=float, help="Sa in Hz (recordings only)")
    ap.add_argument("--first", type=float, default=0.75, help="first string / Sa (default 0.75, a low Pa)")
    args = ap.parse_args()

    a = sl.load(args.audio)
    sidecar = Path(args.audio).with_suffix(".json")
    if sidecar.exists():
        plucks, pitches = sl.load_plucks(sidecar)
    elif args.sa:
        plucks, pitches = None, sl.string_pitches(args.sa, args.first)
    else:
        print(f"{a.path.name}: {a.seconds:.1f} s at {a.sr} Hz. Strongest peaks (Hz, dB):")
        for hz, db in sl.spectral_peaks(a):
            print(f"  {hz:8.2f}  {db:6.1f}")
        print("Pass --sa with Sa's frequency to measure the strings.")
        return

    print(f"{a.path.name}: {a.seconds:.1f} s at {a.sr} Hz")
    print("\nStrongest spectral peaks (Hz, dB re strongest), for checking the tuning:")
    print("  " + "  ".join(f"{hz:.1f} ({db:.0f})" for hz, db in sl.spectral_peaks(a, 10)))
    print("\nString pitches (Hz): " + ", ".join(f"{s} {p:.2f}" for s, p in zip(sl.STRINGS, pitches)))

    r = sl.analyse(a, pitches, plucks)
    p = r.plucks
    print(f"\nPlucks found: " + ", ".join(f"{s} {len(p.times[s])}" for s in sl.STRINGS) + f"; round {p.round:.2f} s")
    print("Each string's delay after the first string, as a share of the round:")
    print("  " + "  ".join(f"{s} {r.timing[s][0]:.3f} ±{r.timing[s][1]:.3f}" for s in sl.STRINGS))
    gaps = [r.timing[s][0] for s in sl.STRINGS] + [1.0]
    print("Gaps after each pluck: " + "  ".join(f"{b - a:.3f}" for a, b in zip(gaps, gaps[1:])))

    print("\nHow much each pluck lifts the whole mix (dB, mean ± spread):")
    print("  " + "  ".join(f"{s} {m:+.1f} ±{d:.1f}" for s, (m, d) in r.lifts.items()))

    print("\nThe mix's level over one round, from the first string's pluck (dB re loudest, 0.25 s steps):")
    print("  " + " ".join(f"{v:.1f}" for v in r.round_db) + f"   range {-r.round_db.min():.1f} dB")

    for s, c in r.curves.items():
        print(f"\n{s} string ({len(sl.string_harmonics(pitches)[s])} harmonics of its own), seconds after its pluck:")
        print("  t          " + "".join(f"{t:7.2f}" for t in sl.TIMES))
        print("  level dB   " + "".join(f"{v:7.0f}" for v in c.level))
        print("  1-2.5k dB  " + "".join(f"{v:7.0f}" for v in c.bloom))
        print("  centroid   " + "".join(f"{v:7.0f}" for v in c.centroid))
        for (lo, hi), row in zip(sl.BANDS, c.bands):
            print(f"  {lo:4d}-{hi:<5d}  " + "".join(f"{v:7.0f}" for v in row))

    for s, leads in r.damp_leads.items():
        if leads:
            print(f"\n{s}: sound cut {np.min(leads):.2f}-{np.max(leads):.2f} s before the next pluck (median {np.median(leads):.2f})")


if __name__ == "__main__":
    main()
