"""Draws the comparison charts in docs/designs/sound-analysis.md.

    pnpm --dir ../../web render-mix          # renders jawari, tambura, guitar at C3
    python compare.py --recording ../../recordings/tambura-C.mp3 --sa 131.05

Reads the renders from ../../recordings/renders and writes PNGs to
../../docs/designs/images/sound-analysis (change with --renders / --out). The doc's
tables come from the feature files instead, through features.py and tables.py,
so they can be redone without the audio.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.signal import stft

import soundlab as sl

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

# The recording is the reference, in ink; the app's voices take the first three
# categorical slots, each with its own line style so none relies on colour alone.
INK = "#0b0b0b"
MUTED = "#52514e"
GRID = "#e4e3df"
SURFACE = "#fcfcfb"
SOURCES = {
    "recording": dict(label=sl.LABELS["recording"], color=INK, ls="-", lw=2.4),
    "jawari": dict(label=sl.LABELS["jawari"], color="#2a78d6", ls="-", lw=2),
    "tambura": dict(label=sl.LABELS["tambura"], color="#eb6834", ls="--", lw=2),
    "guitar": dict(label=sl.LABELS["guitar"], color="#1baf7a", ls=":", lw=2),
    "custom": dict(label=sl.LABELS["custom"], color="#eda100", ls="-.", lw=2),
}
FINE_TIMES = list(np.round(np.arange(0.05, 4.51, 0.05), 2))


def style() -> None:
    plt.rcParams.update(
        {
            "figure.facecolor": SURFACE,
            "axes.facecolor": SURFACE,
            "savefig.facecolor": SURFACE,
            "axes.edgecolor": GRID,
            "axes.labelcolor": MUTED,
            "axes.titlecolor": INK,
            "axes.titlesize": 12,
            "axes.titleweight": "bold",
            "axes.titlelocation": "left",
            "axes.grid": True,
            "grid.color": GRID,
            "grid.linewidth": 0.8,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "xtick.color": MUTED,
            "ytick.color": MUTED,
            "font.size": 10,
            "legend.frameon": False,
        }
    )


def curves(a: sl.Audio, pitches, plucks) -> dict[str, sl.StringCurves]:
    """The per-string curves at FINE_TIMES, for smooth lines."""
    spec = sl.spectrogram(a)
    own = sl.string_harmonics(pitches)
    used = {s: sl.steady(t, a) for s, t in plucks.times.items()}
    return {
        "first": sl.string_curves(spec, pitches[0], own["first"], used["first"], FINE_TIMES),
        "low Sa": sl.string_curves(spec, pitches[3], own["low Sa"], used["low Sa"], FINE_TIMES),
    }


def label_ends(ax, series: dict[str, np.ndarray], x) -> None:
    """Direct labels at the right end of each line, nudged apart."""
    ends = sorted(((ys[-1], k) for k, ys in series.items()), key=lambda e: e[0])
    lo, hi = ax.get_ylim()
    gap = (hi - lo) * 0.08
    placed: list[float] = []
    for y, k in ends:
        y = max(y, placed[-1] + gap) if placed else y
        placed.append(y)
        ax.annotate(SOURCES[k]["label"], (x[-1], y), xytext=(6, 0), textcoords="offset points",
                    va="center", fontsize=9, color=INK)


def line_chart(path: Path, title: str, ylabel: str, panels: list[tuple[str, dict[str, np.ndarray]]], x, xlabel: str) -> None:
    fig, axes = plt.subplots(1, len(panels), figsize=(max(9, 5.6 * len(panels)), 3.8), squeeze=False)
    for ax, (sub, series) in zip(axes[0], panels):
        for k, ys in series.items():
            s = SOURCES[k]
            ax.plot(x, ys, color=s["color"], ls=s["ls"], lw=s["lw"], label=s["label"])
        ax.set_title(sub)
        ax.set_xlabel(xlabel)
        ax.set_ylabel(ylabel)
        ax.set_xlim(x[0], x[-1])
        label_ends(ax, series, x)
    fig.suptitle(title, x=0.01, ha="left", fontsize=13, fontweight="bold", color=INK)
    handles, labels = axes[0][0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=len(labels))
    fig.tight_layout(rect=(0, 0.07, 1, 1), w_pad=4)
    fig.savefig(path, dpi=150)
    plt.close(fig)


def timing_chart(path: Path, results: dict[str, sl.Analysis]) -> None:
    names = [k for k in ("recording", "jawari", "tambura", "custom") if k in results]
    fig, ax = plt.subplots(figsize=(8, 0.9 + 0.7 * len(names)))
    marks = ["o", "s", "D", "^"]
    for row, k in enumerate(reversed(names)):
        t = results[k].timing
        ax.hlines(row, 0, 1, color=GRID, lw=6, zorder=0)
        for i, s in enumerate(sl.STRINGS):
            m, sd = t[s]
            ax.errorbar(m, row, xerr=sd or None, fmt=marks[i], ms=9, color=SOURCES[k]["color"], capsize=3,
                        markeredgecolor=SURFACE, markeredgewidth=1.5)
            ax.annotate(["first", "Sa", "Sa", "low Sa"][i], (m, row), xytext=(0, 11), textcoords="offset points",
                        ha="center", fontsize=8, color=MUTED)
        ax.plot(1, row, marker="o", ms=9, mfc=SURFACE, mec=SOURCES[k]["color"], mew=1.5)
    ax.set_yticks(range(len(names)), [SOURCES[k]["label"] for k in reversed(names)])
    ax.set_xlim(-0.03, 1.05)
    ax.set_ylim(-0.6, len(names) - 0.3)
    ax.set_xlabel("share of the round after the first string's pluck (hollow: the next round)")
    ax.grid(axis="y", visible=False)
    ax.set_title("When each string is plucked")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def lift_chart(path: Path, results: dict[str, sl.Analysis]) -> None:
    names = [k for k in ("recording", "jawari", "tambura", "custom") if k in results]
    fig, ax = plt.subplots(figsize=(7.5, 3.4))
    width = 0.8 / len(names)
    for j, k in enumerate(names):
        xs = np.arange(4) + (j - (len(names) - 1) / 2) * width
        vals = [results[k].lifts.get(s, (np.nan, 0))[0] for s in sl.STRINGS]
        errs = [results[k].lifts.get(s, (0, 0))[1] for s in sl.STRINGS]
        ax.bar(xs, vals, width * 0.9, yerr=errs, color=SOURCES[k]["color"], label=SOURCES[k]["label"],
               error_kw=dict(ecolor=MUTED, lw=1, capsize=2))
    ax.axhline(0, color=MUTED, lw=1)
    ax.set_xticks(range(4), ["first string", "Sa 1", "Sa 2", "low Sa"])
    ax.set_ylabel("lift in the mix (dB)")
    ax.grid(axis="x", visible=False)
    ax.set_title("How much each pluck lifts the whole mix")
    ax.legend(loc="upper left", ncol=len(names))
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def spectrogram_chart(path: Path, audio: dict[str, tuple[sl.Audio, float]], rnd: float) -> None:
    """One round of each, from the first string's pluck, 0-3 kHz."""
    fig, axes = plt.subplots(len(audio), 1, figsize=(8, 1.9 * len(audio) + 0.4), sharex=True)
    for ax, (k, (a, start)) in zip(np.atleast_1d(axes), audio.items()):
        seg = a.mono[int(start * a.sr) : int((start + rnd) * a.sr)]
        f, t, z = stft(seg, a.sr, nperseg=4096, noverlap=4096 - 256)
        db = 20 * np.log10(np.abs(z) + 1e-9)
        keep = f <= 3000
        db = db[keep] - db[keep].max()
        ax.pcolormesh(t, f[keep], db, vmin=-70, vmax=0, cmap="Blues_r", shading="auto", rasterized=True)
        ax.set_ylabel("Hz")
        ax.set_title(SOURCES[k]["label"], fontsize=10)
        ax.grid(False)
    np.atleast_1d(axes)[-1].set_xlabel("seconds after the first string's pluck")
    fig.suptitle("One round, 0-3 kHz (lighter is louder; 70 dB range)", x=0.01, ha="left", fontsize=12,
                 fontweight="bold", color=INK)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--recording", default=str(ROOT / "recordings" / "tambura-C.mp3"))
    ap.add_argument("--sa", type=float, default=131.05, help="the recording's Sa in Hz")
    ap.add_argument("--renders", default=str(ROOT / "recordings" / "renders"))
    ap.add_argument("--out", default=str(ROOT / "docs" / "designs" / "images" / "sound-analysis"))
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    style()

    inputs: dict[str, tuple[sl.Audio, list[float], sl.Plucks | None]] = {}
    rec = sl.load(args.recording)
    inputs["recording"] = (rec, sl.string_pitches(args.sa), None)
    for k in ("jawari", "tambura", "guitar", "custom"):
        wav = Path(args.renders) / f"{k}.wav"
        if wav.exists():
            plucks, pitches = sl.load_plucks(wav.with_suffix(".json"))
            inputs[k] = (sl.load(wav), pitches, plucks)

    results = {k: sl.analyse(a, p, pl, name=k) for k, (a, p, pl) in inputs.items()}
    fine = {k: curves(inputs[k][0], inputs[k][1], results[k].plucks) for k in results}

    x = np.array(FINE_TIMES)
    for key, title, ylabel, fname in (
        ("centroid", "Brightness over a pluck: the spectral centroid", "Hz", "centroid.png"),
        ("bloom", "The jawari bloom: 1-2.5 kHz as a share of the string", "dB", "bloom.png"),
        ("level", "Each string's loudness over a pluck", "dB re its loudest", "string-level.png"),
    ):
        # The guitar's strings fade 40-60 dB, where the other strings' plucks leak into
        # its harmonics; it is left to the round chart and the tables.
        panels = [
            (f"{'First string (Pa)' if s == 'first' else 'Low Sa'}",
             {k: getattr(fine[k][s], key) for k in fine if k != "guitar"})
            for s in ("first", "low Sa")
        ]
        line_chart(out / fname, title, ylabel, panels, x, "seconds after the pluck")

    rx = np.linspace(0, 1, 60)
    rounds = {k: np.interp(rx, r.round_offsets, r.round_db) for k, r in results.items()}
    line_chart(out / "round-level.png", "The mix's loudness over one round, from the first string's pluck",
               "dB re loudest", [("", rounds)], rx, "share of the round")

    timing_chart(out / "pluck-timing.png", results)
    lift_chart(out / "pluck-lift.png", results)

    starts = {k: sl.steady(r.plucks.times["first"], inputs[k][0])[1] for k, r in results.items()}
    spectrogram_chart(out / "spectrograms.png", {k: (inputs[k][0], starts[k]) for k in results},
                      results["recording"].plucks.round)

    print(f"Charts in {out}. The tables come from features.py and tables.py.")


if __name__ == "__main__":
    main()
