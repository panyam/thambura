"""Measurements for comparing tambura recordings with the app's renders.

Used by analyse.py (prints the numbers for one file) and compare.py (draws
the charts in docs/sound-analysis.md). Everything works on a mono mix, so the
four strings are told apart by pitch: each string's harmonics that no other
string shares.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import find_peaks, stft

STRINGS = ["first", "Sa 1", "Sa 2", "low Sa"]
# Seconds after a pluck at which the per-string tables are read.
TIMES = [0.05, 0.4, 1.0, 1.3, 1.6, 2.0, 2.5, 3.0, 4.0]
BANDS = [(0, 250), (250, 600), (600, 1000), (1000, 1600), (1600, 2500), (2500, 4000), (4000, 7000)]
BLOOM = (1000, 2500)


@dataclass
class Audio:
    path: Path
    mono: np.ndarray
    sr: int

    @property
    def seconds(self) -> float:
        return len(self.mono) / self.sr


def load(path: str | Path) -> Audio:
    """Any file libsndfile reads (WAV, FLAC, MP3, OGG), mixed down to mono."""
    x, sr = sf.read(str(path), always_2d=True)
    return Audio(Path(path), x.mean(axis=1), sr)


@dataclass
class Spectrogram:
    """Power per frequency bin and frame. `t` is each frame's centre."""

    f: np.ndarray
    t: np.ndarray
    power: np.ndarray

    @property
    def dt(self) -> float:
        return float(self.t[1] - self.t[0])

    def harmonic(self, hz: float, spread: float = 0.008, reach: float = 10) -> np.ndarray:
        """Power of the peak nearest `hz`, 3 bins wide, per frame. The search covers
        ±spread (a real string's upper harmonics run a little sharp) but never more than
        ±reach Hz, so it can't reach another string's harmonic."""
        d = min(hz * spread + 2, reach)
        lo = np.searchsorted(self.f, hz - d)
        hi = max(lo + 1, np.searchsorted(self.f, hz + d))
        j = lo + int(np.argmax(self.power[lo:hi].sum(axis=1)))
        return self.power[max(0, j - 1) : j + 2].sum(axis=0)


def spectrogram(a: Audio, window: float = 0.186, hop: float = 0.01) -> Spectrogram:
    """A long window (8192 samples at 44.1 kHz) separates harmonics 5 Hz apart."""
    n = 2 ** int(round(np.log2(a.sr * window)))
    step = int(round(a.sr * hop))
    f, t, z = stft(a.mono, a.sr, nperseg=n, noverlap=n - step)
    return Spectrogram(f, t, np.abs(z) ** 2)


def string_pitches(sa: float, first_ratio: float = 0.75) -> list[float]:
    """First string, Sa, Sa, low Sa. The first string sits an octave below its swara (Pa: 3/2 / 2)."""
    return [sa * first_ratio, sa, sa, sa / 2]


def own_harmonics(f0: float, others: list[float], max_hz: float = 7000, gap: float = 25) -> list[int]:
    """Odd harmonics of f0 at least `gap` Hz from every harmonic of the other strings."""
    ks = []
    for k in range(1, int(max_hz / f0) + 1, 2):
        hz = k * f0
        if all(abs(hz - round(hz / o) * o) >= gap for o in others):
            ks.append(k)
    return ks


def string_harmonics(pitches: list[float]) -> dict[str, list[int]]:
    """The harmonics that identify the first string and the low Sa. The Sa strings share
    every harmonic with the low Sa's even ones, so they can't be followed alone."""
    first, sa, _, low = pitches
    return {"first": own_harmonics(first, [low, sa]), "low Sa": own_harmonics(low, [first])}


@dataclass
class Plucks:
    """Pluck times in seconds, per string, and the round length."""

    times: dict[str, list[float]]
    round: float
    damps: dict[str, list[float]] = field(default_factory=dict)


def load_plucks(path: str | Path) -> tuple[Plucks, list[float]]:
    """The JSON `pnpm render-mix` writes next to each WAV: events and string pitches."""
    d = json.loads(Path(path).read_text())
    times: dict[str, list[float]] = {s: [] for s in STRINGS}
    damps: dict[str, list[float]] = {s: [] for s in STRINGS}
    for e in d["events"]:
        (damps if e.get("damp") else times)[STRINGS[e["string"]]].append(e["time"])
    return Plucks(times, d["settings"]["cycleSeconds"], damps), d["frequencies"]


def detect_plucks(a: Audio, spec: Spectrogram, pitches: list[float]) -> Plucks:
    """Finds plucks in a recording.

    - The first string and the low Sa: a sudden rise in their own harmonics.
    - The first Sa: the most prominent rise, between a first-string pluck and the next
      low Sa, in the Sa harmonics the first string doesn't share (Pa's 4th harmonic is
      Sa's 3rd, so Pa's bloom would read as a Sa pluck).
    - The second Sa: its pitch matches the first Sa, which is still ringing, so it barely
      shows in the Sa harmonics. It is the most prominent broadband rise (60 Hz-5 kHz)
      between the first Sa and the low Sa, which is how it is heard too.
    """
    own = string_harmonics(pitches)
    lag = int(round(0.12 / spec.dt))

    def rises(f0: float, ks: list[int]) -> list[float]:
        e = 10 * np.log10(sum(spec.harmonic(k * f0) for k in ks) + 1e-20)
        d = e[lag:] - e[:-lag]
        # A real pluck lifts its own harmonics 25-40 dB; 10 dB leaves out beating.
        peaks, _ = find_peaks(d, height=10, distance=int(1.5 / spec.dt))
        return [float(spec.t[p] + 0.06) for p in peaks]

    first = rises(pitches[0], own["first"])
    low = rises(pitches[3], own["low Sa"])
    rnd = round_length(first)

    fine = spectrogram(a, window=0.093)
    ft = fine.t[:-4] + 0.02

    def flux(rows: np.ndarray) -> np.ndarray:
        log = np.log(rows + 1e-12)
        return np.maximum(0, log[:, 4:] - log[:, :-4]).mean(axis=0)

    sa = pitches[1]
    sa_ks = [k for k in range(1, 21) if abs(k * sa - round(k * sa / pitches[0]) * pitches[0]) >= 15]
    sa_flux = flux(np.array([fine.harmonic(k * sa) for k in sa_ks]))
    broad_flux = flux(fine.power[(fine.f > 60) & (fine.f < 5000)])

    def strongest(fl: np.ndarray, lo: float, hi: float) -> float | None:
        sel = (ft > lo) & (ft < hi)
        pk, props = find_peaks(fl[sel], distance=int(0.1 * rnd / fine.dt), prominence=0)
        return float(ft[sel][pk[np.argmax(props["prominences"])]]) if len(pk) else None

    sa1, sa2 = [], []
    for p in first:
        nxt = [x for x in low if p + 0.1 * rnd < x < p + rnd]
        if not nxt:
            continue
        s1 = strongest(sa_flux, p + 0.1 * rnd, nxt[0] - 0.05 * rnd)
        s2 = s1 and strongest(broad_flux, s1 + 0.08 * rnd, nxt[0] - 0.04 * rnd)
        if s1 and s2:
            sa1.append(s1)
            sa2.append(s2)
    return Plucks({"first": first, "Sa 1": sa1, "Sa 2": sa2, "low Sa": low}, rnd)


def steady(times: list[float], a: Audio, margin: float = 6.0, tail: float = 6.0) -> list[float]:
    """Drops plucks in a fade-in or fade-out, or too near the end to measure."""
    return [t for t in times if margin <= t <= a.seconds - tail]


def round_length(first: list[float]) -> float:
    return float(np.median(np.diff(first))) if len(first) > 1 else 0.0


def pluck_timing(p: Plucks) -> dict[str, tuple[float, float]]:
    """Each string's delay after the first string's pluck, as a share of the round (mean, spread)."""
    out = {"first": (0.0, 0.0)}
    for s in STRINGS[1:]:
        delays = []
        for t in p.times[s]:
            before = [x for x in p.times["first"] if x <= t]
            if before and t - before[-1] < p.round:
                delays.append((t - before[-1]) / p.round)
        out[s] = (float(np.mean(delays)), float(np.std(delays))) if delays else (float("nan"), 0.0)
    return out


@dataclass
class StringCurves:
    """One string over its ring, averaged over its plucks, read at TIMES."""

    level: np.ndarray  # dB, relative to its loudest moment
    bloom: np.ndarray  # dB, the 1-2.5 kHz band's share of the string's harmonics
    centroid: np.ndarray  # Hz, the energy-weighted mean frequency
    bands: np.ndarray  # dB per BANDS row, relative to the loudest moment


def string_curves(spec: Spectrogram, f0: float, ks: list[int], onsets: list[float], times=TIMES) -> StringCurves:
    n = int(max(times) / spec.dt) + 3
    total = np.zeros(n)
    bloom = np.zeros(n)
    weighted = np.zeros(n)
    bands = np.zeros((len(BANDS), n))
    for o in onsets:
        i0 = int(np.searchsorted(spec.t, o))
        if i0 + n > spec.power.shape[1]:
            continue
        for k in ks:
            hz = k * f0
            p = spec.harmonic(hz)[i0 : i0 + n]
            total += p
            weighted += p * hz
            if BLOOM[0] <= hz < BLOOM[1]:
                bloom += p
            for b, (lo, hi) in enumerate(BANDS):
                if lo <= hz < hi:
                    bands[b] += p
    idx = [int(round(x / spec.dt)) for x in times]
    peak = total.max()
    return StringCurves(
        level=10 * np.log10(total[idx] / peak),
        bloom=10 * np.log10(bloom[idx] / total[idx] + 1e-20),
        centroid=weighted[idx] / total[idx],
        bands=10 * np.log10(bands[:, idx] / peak + 1e-20),
    )


def round_level(a: Audio, first: list[float], rnd: float, step: float = 0.25) -> tuple[np.ndarray, np.ndarray]:
    """The mix's loudness over one round from the first string's pluck, averaged over rounds (dB re max)."""
    offs = np.arange(0, rnd, step)
    acc = np.zeros(len(offs))
    used = 0
    for p in first:
        if int((p + rnd) * a.sr) > len(a.mono):
            continue
        for j, o in enumerate(offs):
            s = int((p + o) * a.sr)
            acc[j] += np.mean(a.mono[s : s + int(step * a.sr)] ** 2)
        used += 1
    db = 10 * np.log10(acc / max(used, 1))
    return offs / rnd, db - db.max()


def pluck_lift(a: Audio, times: list[float]) -> tuple[float, float]:
    """How much a pluck lifts the whole mix: the loudest 30 ms in the 0.2 s after it,
    against the 0.23 s before, in dB (mean, spread)."""
    w = int(0.03 * a.sr)
    rms = lambda s, e: np.sqrt(np.mean(a.mono[s:e] ** 2))
    lifts = []
    for t in times:
        i = int(t * a.sr)
        pre = rms(i - int(0.25 * a.sr), i - int(0.02 * a.sr))
        post = max(rms(j, j + w) for j in range(i, i + int(0.2 * a.sr), w // 2))
        lifts.append(20 * np.log10(post / pre))
    return float(np.mean(lifts)), float(np.std(lifts))


def damp_leads(spec: Spectrogram, f0: float, ks: list[int], onsets: list[float]) -> list[float]:
    """For each pluck, how long before the string's next pluck its sound was cut: the
    steepest 0.3 s fall in its own harmonics from 3 s after the pluck (seconds)."""
    e = 10 * np.log10(sum(spec.harmonic(k * f0) for k in ks) + 1e-20)
    w = int(round(0.3 / spec.dt))
    leads = []
    for o, nxt in zip(onsets, onsets[1:]):
        i0 = int(np.searchsorted(spec.t, o + 3))
        i1 = int(np.searchsorted(spec.t, nxt))
        if i1 - i0 <= w:
            continue
        d = e[i0 + w : i1] - e[i0 : i1 - w]
        j = int(np.argmin(d))
        leads.append(float(nxt - spec.t[i0 + j + w // 2]))
    return leads


def spectral_peaks(a: Audio, n: int = 16, start: float = 10, seconds: float = 30) -> list[tuple[float, float]]:
    """The strongest spectral peaks (Hz, dB re strongest) over a long stretch, for tuning."""
    s = int(min(start, max(0, a.seconds - seconds)) * a.sr)
    seg = a.mono[s : s + int(seconds * a.sr)]
    size = 1 << int(np.log2(len(seg)))
    spec = np.abs(np.fft.rfft(seg[:size] * np.hanning(size)))
    f = np.fft.rfftfreq(size, 1 / a.sr)
    db = 20 * np.log10(spec / spec.max() + 1e-12)
    pk, _ = find_peaks(db, height=-50, distance=int(8 / (a.sr / size)))
    pk = pk[f[pk] > 40]
    top = sorted(pk, key=lambda p: -db[p])[:n]
    return [(float(f[p]), float(db[p])) for p in top]


@dataclass
class Analysis:
    """Everything analyse.py prints and compare.py draws, for one file."""

    name: str
    pitches: list[float]
    plucks: Plucks
    timing: dict[str, tuple[float, float]]
    curves: dict[str, StringCurves]
    round_offsets: np.ndarray
    round_db: np.ndarray
    lifts: dict[str, tuple[float, float]]
    damp_leads: dict[str, list[float]]


def analyse(a: Audio, pitches: list[float] | None = None, plucks: Plucks | None = None, name: str = "") -> Analysis:
    spec = spectrogram(a)
    if pitches is None:
        raise ValueError("pass the string pitches (string_pitches(sa)) or a render's JSON")
    if plucks is None:
        plucks = detect_plucks(a, spec, pitches)
    own = string_harmonics(pitches)
    used = {s: steady(ts, a) for s, ts in plucks.times.items()}
    rnd = round_length(used["first"]) or plucks.round
    curves = {
        "first": string_curves(spec, pitches[0], own["first"], used["first"]),
        "low Sa": string_curves(spec, pitches[3], own["low Sa"], used["low Sa"]),
    }
    offs, db = round_level(a, used["first"], rnd)
    return Analysis(
        name=name or a.path.stem,
        pitches=pitches,
        plucks=Plucks(used, rnd, plucks.damps),
        timing=pluck_timing(Plucks(used, rnd)),
        curves=curves,
        round_offsets=offs,
        round_db=db,
        lifts={s: pluck_lift(a, used[s]) for s in STRINGS if used[s]},
        damp_leads={
            "first": damp_leads(spec, pitches[0], own["first"], used["first"]),
            "low Sa": damp_leads(spec, pitches[3], own["low Sa"], used["low Sa"]),
        },
    )
