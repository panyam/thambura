"""Writes the tables in docs/sound-analysis.md from the feature files.

    python tables.py            # rewrite the tables in the doc
    python tables.py --check    # say whether the doc matches, and exit 1 if not
    python tables.py --print    # print them instead of touching the doc

The doc marks each table with <!-- generated: NAME --> and <!-- /generated -->,
and everything between is this script's. Nothing here reads audio: the numbers
come from features/*.json, so the tables can be redone from a clean checkout
and can't drift from what features.py measured.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import soundlab as sl

HERE = Path(__file__).resolve().parent
DOC = HERE.parent.parent / "docs" / "sound-analysis.md"
# Column order. A file that isn't there is left out, so a Lab render can join
# the tables by being measured into features/custom.json.
ORDER = ["tambura-C", "jawari", "tambura", "guitar", "custom"]
COLUMN = {"tambura-C": "recording"}


def load(folder: Path) -> dict[str, dict]:
    found = {}
    for name in ORDER:
        path = folder / f"{name}.json"
        if path.exists():
            found[sl.LABELS[COLUMN.get(name, name)]] = json.loads(path.read_text())
    return found


def table(head: str, cols: list[str], rows: list[tuple[str, list[str]]]) -> str:
    out = [f"| {head} | " + " | ".join(cols) + " |", "|---" * (len(cols) + 1) + "|"]
    out += [f"| {name} | " + " | ".join(cells) + " |" for name, cells in rows]
    return "\n".join(out)


def fmt(v, spec: str = "+.1f", missing: str = "-") -> str:
    return missing if v is None else format(v, spec)


def timing(fs: dict[str, dict]) -> str:
    rows = []
    for s in sl.STRINGS[1:]:
        rows.append((f"{s}, after the first string",
                     [f"{f['timing']['onset_share'][s][0]:.3f} ±{f['timing']['onset_share'][s][1]:.3f}"
                      for f in fs.values()]))
    for s in ("first", "low Sa"):
        rows.append((f"{s}: stopped before its next pluck (s)",
                     [fmt(f["strings"][s]["damp_lead"]["measured_s"], ".2f", "rings on") for f in fs.values()]))
    return table("When each string is plucked (share of the round)", list(fs), rows)


def strings_over_time(fs: dict[str, dict], string: str) -> str:
    times = next(iter(fs.values()))["times"]
    rows = []
    for key, label, spec in (("bloom_db", "1-2.5 kHz share (dB)", ".0f"),
                             ("centroid_hz", "centroid (Hz)", ".0f"),
                             ("level_db", "level (dB re its loudest)", ".0f")):
        for name, f in fs.items():
            rows.append((f"{label}, {name}", [fmt(v, spec) for v in f["strings"][string][key]]))
    head = f"{'First string (Pa)' if string == 'first' else 'Low Sa'}, seconds after its pluck"
    return table(head, [f"{t:g}" for t in times], rows)


def loudness(fs: dict[str, dict]) -> str:
    rows = [("level range over a round (dB)", [fmt(f["mix"]["round_range_db"], ".1f") for f in fs.values()]),
            ("level range, A-weighted (dB)", [fmt(f["mix"]["round_range_a_db"], ".1f") for f in fs.values()])]
    for s in sl.STRINGS:
        rows.append((f"{s} pluck lift (dB)", [fmt(f["mix"]["pluck_lift_db"][s][0]) for f in fs.values()]))
        rows.append((f"{s} pluck lift, A-weighted (dB)",
                     [fmt(f["mix"]["pluck_lift_a_db"][s][0]) for f in fs.values()]))
    return table("The whole mix", list(fs), rows)


def texture(fs: dict[str, dict]) -> str:
    rows = []
    for s in ("first", "low Sa"):
        rows.append((f"{s}: T60 of its harmonics, median (s)",
                     [fmt(f["strings"][s]["decay"]["median_s"], ".1f") for f in fs.values()]))
    for s in ("first", "low Sa"):
        rows.append((f"{s}: between the harmonics (dB re the harmonics)",
                     [fmt(f["strings"][s]["noise_median_db"], ".0f") for f in fs.values()]))
    for s in ("first", "low Sa"):
        rows.append((f"{s}: harmonic 20 sharp by (cents)",
                     [fmt(f["strings"][s]["inharmonicity"]["cents_at_20"], ".2f") for f in fs.values()]))
    return table("Texture", list(fs), rows)


BLOCKS = {
    "timing": timing,
    "loudness": loudness,
    "bloom-first": lambda fs: strings_over_time(fs, "first"),
    "bloom-low-sa": lambda fs: strings_over_time(fs, "low Sa"),
    "texture": texture,
}


def rendered(fs: dict[str, dict]) -> dict[str, str]:
    return {name: build(fs) for name, build in BLOCKS.items()}


def substitute(doc: str, blocks: dict[str, str]) -> str:
    for name, body in blocks.items():
        pattern = re.compile(rf"<!-- generated: {name} -->\n?.*?<!-- /generated -->", re.S)
        if not pattern.search(doc):
            raise SystemExit(f"{DOC}: no <!-- generated: {name} --> block")
        # A function as the replacement, so nothing in a table is read as a
        # backreference.
        doc = pattern.sub(lambda _: f"<!-- generated: {name} -->\n{body}\n<!-- /generated -->", doc)
    return doc


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--features", default=str(HERE / "features"))
    ap.add_argument("--doc", default=str(DOC))
    ap.add_argument("--check", action="store_true", help="exit 1 if the doc is out of date")
    ap.add_argument("--print", dest="show", action="store_true", help="print the tables, leave the doc alone")
    args = ap.parse_args()

    fs = load(Path(args.features))
    if not fs:
        raise SystemExit(f"no feature files in {args.features}; run features.py first")
    blocks = rendered(fs)
    if args.show:
        for name, body in blocks.items():
            print(f"\n<!-- generated: {name} -->\n{body}\n<!-- /generated -->")
        return

    doc = Path(args.doc)
    before = doc.read_text()
    after = substitute(before, blocks)
    if args.check:
        if before != after:
            raise SystemExit(f"{doc} is out of date; run tools/sound-analysis/tables.py")
        print(f"{doc}: tables match features/ ({', '.join(fs)})")
        return
    doc.write_text(after)
    print(f"{doc}: {len(blocks)} tables from {len(fs)} feature files ({', '.join(fs)})")


if __name__ == "__main__":
    main()
