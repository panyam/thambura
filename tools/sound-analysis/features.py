"""Measures one tambura recording or render into a feature file.

    python features.py ../../recordings/tambura-C.mp3 --sa 131.05 -o features/tambura-C.json
    python features.py ../../recordings/renders/jawari.wav -o features/jawari.json

The output is the same shape either way (soundlab.features), so score.py can
compare any two files and tables.py can print any of them. A render brings its
pitches, pluck times and settings in the JSON beside it. A recording needs Sa
in Hz (--sa; run analyse.py with no --sa to find it) and, if its first string
isn't Pa, --first with the swara's ratio to Sa halved (Ma 0.667, Ni 0.9375).

The feature files in features/ are committed, so the tables and the scores can
be redone without the audio, which stays out of git. Re-run this after
changing a voice, and the diff shows what the change did.
"""

import argparse
import json
from pathlib import Path

import soundlab as sl


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("--sa", type=float, help="Sa in Hz (recordings only)")
    ap.add_argument("--first", type=float, default=0.75, help="first string / Sa (default 0.75, a low Pa)")
    ap.add_argument("--name", help="what to call it in the tables (default: the file's stem)")
    ap.add_argument("-o", "--out", help="where to write the JSON (default: stdout)")
    args = ap.parse_args()

    a = sl.load(args.audio)
    sidecar = Path(args.audio).with_suffix(".json")
    if sidecar.exists():
        plucks, pitches = sl.load_plucks(sidecar)
        meta = json.loads(sidecar.read_text())
        kind, render = "render", {"mode": meta["mode"], "settings": meta["settings"]}
    elif args.sa:
        plucks, pitches, kind, render = None, sl.string_pitches(args.sa, args.first), "recording", None
    else:
        ap.error("pass --sa with Sa's frequency, or point at a render with its JSON beside it")

    f = sl.features(a, pitches, plucks, name=args.name or a.path.stem, kind=kind, render=render)
    text = json.dumps(f, indent=1) + "\n"
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(text)
        s = f["source"]
        print(f"{args.out}: {s['name']} ({s['kind']}), {s['round_seconds']} s round, "
              + ", ".join(f"{k} {v}" for k, v in s["plucks"].items()) + " plucks")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
