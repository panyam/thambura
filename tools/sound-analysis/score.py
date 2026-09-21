"""Scores one feature file against another: how different two sounds measure.

    python score.py features/tambura-C.json features/jawari.json
    python score.py features/tambura-C.json features/jawari.json --json

The first file is the target, usually a recording; the second is the sound
being judged. Both come from features.py. Every feature is divided by a
tolerance before it counts, so a group's distance reads as "how many
tolerances out" and 1 means about as wrong as a listener would start to
notice. The total is the weighted RMS over the groups.

A score is a guide, not a verdict. Two sounds can measure alike and differ by
ear, which is why the Lab and a pair of headphones end every comparison.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

MEASURED = ["first", "low Sa"]  # the strings a mono mix lets us follow alone
# How far into a string's ring its curves are worth comparing. The low Sa's
# readings after 2 s are the first string's next pluck leaking in at a level
# where the low Sa has gone quiet ("Results" in docs/sound-analysis.md).
UNTIL = {"first": 4.0, "low Sa": 2.0}


@dataclass
class Group:
    """One line of the breakdown.

    `pick` pulls the group's numbers out of a feature file, named so the
    breakdown can say which one is worst. `tol` is the difference at which the
    group scores 1: roughly where it stops being a rounding error and starts
    being a different sound. `scale` "log2" compares ratios rather than
    differences, for the features that live on a musical scale. A group with
    `counts` false is printed but kept out of the total.
    """

    key: str
    label: str
    weight: float
    tol: float
    unit: str
    pick: Callable[[dict], dict[str, float | None]]
    scale: str = "linear"
    counts: bool = True


def curve(f: dict, string: str, key: str) -> dict[str, float | None]:
    return {f"{string} at {t:g} s": v
            for t, v in zip(f["times"], f["strings"][string][key]) if t <= UNTIL[string]}


def both(f: dict, key: str) -> dict[str, float | None]:
    return {k: v for s in MEASURED for k, v in curve(f, s, key).items()}


# Weights say what matters in a tambura; tolerances say what counts as close.
# Both are judgements, and this table is the place to argue with them.
GROUPS = [
    # The player's uneven spacing is the first thing that marks a real tambura
    # from an electronic one, and 0.02 of a round is about 0.1 s at 5.8 s.
    Group("timing", "timing", 1.5, 0.02, "of the round", lambda f: f["timing"]["gap_share"]),
    # Where a string is stopped before its next pluck. A voice that never stops
    # one reads 0, which is what letting it ring into its own next pluck means.
    Group("damp", "string stops", 0.75, 0.04, "of the round",
          lambda f: {s: (f["strings"][s]["damp_lead"]["share"] or 0.0) for s in MEASURED}),
    # A drone's plucks barely lift the mix; getting this wrong is what makes a
    # synthesized tambura sound like a sequence of notes. 1 dB is audible here.
    Group("lift", "pluck lift", 1.25, 1.0, "dB",
          lambda f: {s: v[0] for s, v in f["mix"]["pluck_lift_db"].items()}),
    Group("round", "level over a round", 0.75, 1.5, "dB",
          lambda f: {f"{s:.2f} of the round": v
                     for s, v in zip(f["mix"]["round_shares"], f["mix"]["round_level_db"])}),
    # The jawari itself: the 1-2.5 kHz swell, and the brightness it carries with
    # it. Weighted hardest, since it is what the voice was built to reproduce.
    Group("bloom", "bloom", 2.0, 2.0, "dB", lambda f: both(f, "bloom_db")),
    Group("centroid", "brightness", 1.5, 0.25, "octaves", lambda f: both(f, "centroid_hz"), "log2"),
    Group("level", "string level", 1.0, 2.0, "dB", lambda f: both(f, "level_db")),
    # The first reading of the level curve, 0.05 s in: how much of the string's
    # loudest moment is there at the attack.
    Group("attack", "attack", 0.75, 1.5, "dB",
          lambda f: {s: f["strings"][s]["level_db"][0] for s in MEASURED}),
    # How long the partials ring. A recording's harmonics beat against each
    # other, so this is noisy; a factor of 1.4 either way still scores 1.
    Group("ring", "ring", 0.75, 0.5, "x",
          lambda f: {s: f["strings"][s]["decay"]["median_s"] for s in MEASURED}, "log2"),
    # The buzz between the harmonics. A real jawari has one and an additive
    # synth has none, so this group is mostly a reminder of what's missing (#52).
    # The buzz between the harmonics. A real jawari has one and a sum of
    # harmonics has none, whatever its parameters, so this stays out of the
    # total: it would add the same 8 to every render and bury the differences
    # that tuning can reach. It is printed because it is the size of what the
    # model is missing (#52).
    Group("buzz", "buzz between the harmonics", 0.0, 6.0, "dB",
          lambda f: {s: f["strings"][s]["noise_median_db"] for s in MEASURED}, counts=False),
    # How sharp the upper harmonics run. Small for both a tambura and our synth,
    # so it carries little weight until a recording shows otherwise.
    Group("inharmonicity", "inharmonicity", 0.25, 5.0, "cents",
          lambda f: {s: f["strings"][s]["inharmonicity"]["cents_at_20"] for s in MEASURED}),
]


def compare(target: dict, other: dict) -> dict:
    """Every group's distance, and the weighted RMS over them.

    A feature missing from either file (a decay no fit could measure, a string
    with no plucks) is left out of its group, and a group with nothing left is
    dropped from the total rather than counted as a match.
    """
    rows = []
    for g in GROUPS:
        a, b = g.pick(target), g.pick(other)
        parts = []
        for k in a:
            if a[k] is None or b.get(k) is None:
                continue
            d = (math_log2(b[k] / a[k]) if g.scale == "log2" else b[k] - a[k])
            parts.append((k, d, d / g.tol))
        if not parts:
            rows.append({"key": g.key, "label": g.label, "weight": g.weight, "counts": g.counts,
                         "distance": None, "worst": None, "delta": None, "unit": g.unit,
                         "scale": g.scale, "n": 0})
            continue
        dist = (sum(p[2] ** 2 for p in parts) / len(parts)) ** 0.5
        worst = max(parts, key=lambda p: abs(p[2]))
        rows.append({"key": g.key, "label": g.label, "weight": g.weight, "counts": g.counts,
                     "distance": dist, "worst": worst[0], "delta": worst[1], "unit": g.unit,
                     "scale": g.scale, "n": len(parts)})
    scored = [r for r in rows if r["distance"] is not None and r["counts"]]
    w = sum(r["weight"] for r in scored)
    total = (sum(r["weight"] * r["distance"] ** 2 for r in scored) / w) ** 0.5 if w else None
    return {"target": target["source"]["name"], "name": other["source"]["name"],
            "total": total, "groups": rows}


def math_log2(x: float) -> float:
    from math import log2

    return log2(x) if x > 0 else float("nan")


def phrase(row: dict) -> str:
    if row["distance"] is None:
        return "not measured in both"
    d, unit = row["delta"], row["unit"]
    if row["scale"] == "log2":
        return f"{row['worst']} {2 ** d:.2f}{unit}" if unit == "x" else f"{row['worst']} {d:+.2f} {unit}"
    return f"{row['worst']} {d:+.2f} {unit}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", help="the features to match, usually a recording's")
    ap.add_argument("other", nargs="+", help="the features to score against it")
    ap.add_argument("--json", action="store_true", help="print the same numbers as JSON")
    args = ap.parse_args()

    target = json.loads(Path(args.target).read_text())
    results = [compare(target, json.loads(Path(p).read_text())) for p in args.other]
    if args.json:
        print(json.dumps(results if len(results) > 1 else results[0], indent=1))
        return
    for r in results:
        print(f"\n{r['name']} against {r['target']}: {r['total']:.2f}"
              "   (0 is the same measurements; 1 is about one tolerance out)")
        for row in r["groups"]:
            d = row["distance"]
            mark = "?" if d is None else "✓" if d < 1 else "~" if d < 2 else "✗"
            score = "     " if d is None else f"{d:5.2f}"
            note = "" if row["counts"] else "  (not in the total)"
            print(f"  {mark} {row['label']:28s} {score}   {phrase(row)}{note}")


if __name__ == "__main__":
    main()
