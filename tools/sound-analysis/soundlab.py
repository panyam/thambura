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
from scipy.optimize import least_squares
from scipy.signal import bilinear, find_peaks, lfilter, stft

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


def spectrogram(a: Audio, window: float = 0.186, hop: float = 0.01, shape: str = "hann") -> Spectrogram:
    """A long window (8192 samples at 44.1 kHz) separates harmonics 5 Hz apart.
    `shape` is the window function: the default hann leaks about -31 dB into the
    bins beside a harmonic, which is fine for reading the harmonics themselves
    and far too much for reading the quiet between them (see noise_curve)."""
    n = 2 ** int(round(np.log2(a.sr * window)))
    step = int(round(a.sr * hop))
    f, t, z = stft(a.mono, a.sr, window=shape, nperseg=n, noverlap=n - step)
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


def string_curves(spec: Spectrogram, f0: float, ks: list[int], onsets: list[float], times=TIMES,
                  bands_hz=BANDS) -> StringCurves:
    n = int(max(times) / spec.dt) + 3
    total = np.zeros(n)
    bloom = np.zeros(n)
    weighted = np.zeros(n)
    bands = np.zeros((len(bands_hz), n))
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
            for b, (lo, hi) in enumerate(bands_hz):
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
        pre = max(rms(i - int(0.25 * a.sr), i - int(0.02 * a.sr)), 1e-12)  # silence before the first pluck
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


def aligned(spec: Spectrogram, hz: float, onsets: list[float], n: int) -> np.ndarray:
    """One harmonic's power from its pluck, summed over the plucks (n frames)."""
    acc = np.zeros(n)
    curve = spec.harmonic(hz)
    for o in onsets:
        i = int(np.searchsorted(spec.t, o))
        if i + n <= len(curve):
            acc += curve[i : i + n]
    return acc


def decay_rates(spec: Spectrogram, f0: float, ks: list[int], onsets: list[float], start: float = 2.0,
                end: float = 4.5, fall: float = 1.5, fit_hz: float = 1000, fit_r2: float = 0.5) -> dict:
    """Each harmonic's T60, and the damping that explains the set.

    A line through the harmonic's dB curve over `start` to `end`, extended to a
    60 dB fall. The window opens after the bloom has swelled and fallen back, so
    what is measured is the ring rather than the bloom, and it closes before the
    player stops the string. Nothing here falls 60 dB inside it, so every T60 is
    an extrapolation from a few dB; a harmonic that falls less than `fall` dB, or
    that doesn't fall along a line (r² under `fit_r2`), says nothing and is left
    out. In a recording the strings beat against each other, so neighbouring
    harmonics can differ two- or threefold and `median_s` is the number to read.

    The window closes before the string's next pluck whatever `end` says, so a
    short round measures a shorter stretch of ring rather than the pluck after it.

    `damping` is the same number fit.py fits: how much faster harmonic k decays
    than the fundamental, in tau_k = tau_1 / (1 + damping (k - 1)). That model is
    monotone and the measurements aren't, because the bloom's tail is still
    falling where it sits, so the summary is fit below `fit_hz`, under the bloom,
    and `fundamental_s` is that line read back at k = 1 rather than a measurement.
    """
    if len(onsets) > 1:
        end = min(end, float(np.median(np.diff(onsets))) - 0.3)
    if end - start < 1.5:
        return {"per_harmonic": [], "harmonics": 0, "median_s": None, "fundamental_s": None, "damping": None}
    n = int(end / spec.dt) + 2
    i0 = int(start / spec.dt)
    per = []
    for k in ks:
        db = 10 * np.log10(aligned(spec, k * f0, onsets, n) + 1e-20)
        t = spec.t[i0:n] - spec.t[i0]
        y = db[i0:n]
        if t[-1] - t[0] < 1.5:
            continue
        slope, c = np.polyfit(t, y, 1)
        resid = y - (slope * t + c)
        r2 = 1 - resid.var() / max(y.var(), 1e-12)
        if slope >= 0 or -slope * (t[-1] - t[0]) < fall or r2 < fit_r2:
            continue
        per.append((k, float(k * f0), float(-60 / slope)))
    out = {"per_harmonic": [[k, round(hz, 1), round(t60, 2)] for k, hz, t60 in per],
           "harmonics": len(per), "median_s": None, "fundamental_s": None, "damping": None}
    if per:
        out["median_s"] = round(float(np.median([t60 for _, _, t60 in per])), 1)
    low = [(k, t60) for k, hz, t60 in per if hz <= fit_hz]
    if len(low) >= 3:
        rate = np.log(1000) / np.array([t60 for _, t60 in low])  # 1 / tau
        c0, c1 = np.polyfit([k - 1 for k, _ in low], rate, 1)[::-1]
        if c0 > 0:
            out["fundamental_s"] = round(float(np.log(1000) / c0), 1)
            out["damping"] = round(float(c1 / c0), 4)
    return out


def inharmonicity(a: Audio, f0: float, ks: list[int], onsets: list[float], start: float = 0.5,
                  window: float = 2.0, max_hz: float = 4000, floor: float = 15.0) -> dict:
    """How far the upper harmonics run sharp of exact multiples.

    A stiff string's harmonic k sits at k f0 sqrt(1 + B k²). Each harmonic's peak
    is read from a 2 s window after the pluck (0.5 Hz bins) and refined between
    bins by a parabola through the peak in dB, then f0 and B are fit to the set.
    The peaks are read several times over a widening range of harmonics, because
    a stiff string's harmonic 30 can sit further from 30 f0 than the search
    reaches: first the low harmonics near the exact multiples, which give the
    string's real pitch, then each wider range near where the fit so far puts
    them. The fit that ends up closest to its own peaks is the one reported, so
    a widening search that wanders onto noise loses to the tighter one before
    it, and a string whose partials don't follow the law comes back at B near 0
    rather than at whatever the last pass chased.

    `cents_at_20` is the same B said as how sharp harmonic 20 runs, which is the
    audible form, and `tuning_cents` is how far the fitted f0 sits from the pitch
    it was asked about, which for a recording is the player's tuning rather than
    the string's stiffness. A sum of exact harmonics, which is what the app
    renders, gives B = 0.
    """
    empty = {"b": None, "cents_at_20": None, "f0_hz": None, "tuning_cents": None,
             "harmonics": 0, "residual_cents": None}
    n = int(window * a.sr)
    win = np.hanning(n)
    acc = np.zeros(n // 2 + 1)
    used = 0
    for o in onsets:
        i = int((o + start) * a.sr)
        seg = a.mono[i : i + n]
        if len(seg) < n:
            continue
        acc += np.abs(np.fft.rfft(seg * win)) ** 2
        used += 1
    if not used:
        return empty
    f = np.fft.rfftfreq(n, 1 / a.sr)
    df = float(f[1] - f[0])
    db = 10 * np.log10(acc + 1e-30)

    def peaks(where, reach: float = 10.0) -> list[tuple[int, float]]:
        """Each harmonic's peak, searched around `where(k)`, to a fifth of the way
        to the next harmonic at most, so the search can't walk onto its neighbour.
        A peak less than `floor` dB above what surrounds it is skipped: in a mix
        it is as likely to be another string, and a peak read from noise moves
        the fit further than a missing harmonic does."""
        found = []
        for k in ks:
            if k * f0 > max_hz:
                break
            hz = where(k)
            d = min(hz * 0.008 + 2, reach, 0.2 * f0)
            lo = int(np.searchsorted(f, hz - d))
            hi = max(lo + 1, int(np.searchsorted(f, hz + d)))
            j = lo + int(np.argmax(db[lo:hi]))
            if j < 1 or j >= len(db) - 1 or db[j] - float(np.median(db[max(0, j - 200) : j + 200])) < floor:
                continue
            y0, y1, y2 = db[j - 1], db[j], db[j + 1]
            curv = y0 - 2 * y1 + y2
            found.append((k, float(f[j] + (0.5 * (y0 - y2) / curv if curv < 0 else 0.0) * df)))
        return found

    # In shares rather than Hz, so harmonic 3 counts as much as harmonic 40.
    def fit(rows):
        resid = lambda x: [hz / (k * x[0] * np.sqrt(1 + x[1] * k * k)) - 1 for k, hz in rows]
        return least_squares(resid, [f0, 1e-5], bounds=([f0 * 0.96, 0], [f0 * 1.04, 1e-2]))

    seed = peaks(lambda k: k * f0)[:6]
    if len(seed) < 4:
        return {**empty, "harmonics": len(seed)}
    # The lowest harmonics barely move with stiffness, so they give the pitch on
    # their own, and a pitch is enough to aim the next search.
    f0r = float(least_squares(lambda x: [hz / (k * x[0]) - 1 for k, hz in seed], [f0],
                              bounds=([f0 * 0.96], [f0 * 1.04])).x[0])
    b, tries = 0.0, []
    for limit in (14, 22, max(ks)):
        found = [m for m in peaks(lambda k, f0r=f0r, b=b: k * f0r * np.sqrt(1 + b * k * k))
                 if m[0] <= limit]
        if len(found) < 4:
            break
        got = fit(found)
        # Again without the peaks that missed: another string's harmonic, or noise.
        # Against the median error, not the RMS, since one peak 200 cents out
        # would otherwise widen the net enough to keep itself.
        spread = max(float(np.median(np.abs(got.fun))), 1e-5)
        keep = [m for m, e in zip(found, got.fun) if abs(e) <= 4 * spread]
        if len(keep) >= 4:
            found, got = keep, fit(keep)
        f0r, b = float(got.x[0]), float(got.x[1])
        tries.append((float(np.sqrt(np.mean(np.array(got.fun) ** 2))), found, got))
    if not tries:
        return {**empty, "harmonics": len(seed)}
    _, meas, sol = min(tries, key=lambda x: x[0])
    return {
        "b": float(f"{b:.3g}"),
        "cents_at_20": round(float(1200 * np.log2(np.sqrt(1 + b * 400))), 2),
        "f0_hz": round(float(sol.x[0]), 2),
        "tuning_cents": round(float(1200 * np.log2(sol.x[0] / f0)), 1),
        "harmonics": len(meas),
        "residual_cents": round(float(1200 * np.log2(1 + np.sqrt(np.mean(np.array(sol.fun) ** 2)))), 1),
    }


def between_harmonics(f0: float, others: list[float], max_hz: float = 7000, gap: float = 20,
                      steps: int = 13) -> list[float]:
    """The quietest spot in each gap between consecutive harmonics of f0: the
    frequency furthest from every string's harmonics. Midway is not it, since the
    other strings' harmonics fall there. Gaps with nothing `gap` Hz clear of a
    harmonic are dropped; at C that leaves a spot a quarter of the way up each
    of the first string's gaps, 24 Hz from anything."""
    grid = [f0] + others
    out = []
    for k in range(1, int(max_hz / f0)):
        hz = k * f0 + f0 * np.linspace(0.2, 0.8, steps)
        clear = [min(abs(h - round(h / o) * o) for o in grid) for h in hz]
        j = int(np.argmax(clear))
        if clear[j] >= gap:
            out.append(float(hz[j]))
    return out


def noise_curve(a: Audio, f0: float, ks: list[int], others: list[float], onsets: list[float],
                times=TIMES, halfwidth: float = 10.0) -> np.ndarray:
    """The buzz and noise between the harmonics, in dB relative to the harmonics
    themselves, per bin so the two are comparable.

    This gets its own spectrogram, with a Blackman-Harris window over 0.37 s: its
    sidelobes are 92 dB down, where the default hann window's are 31 dB down and
    would fill the quiet between the harmonics with the harmonics themselves. A
    real jawari rattles and reads around -25 dB; a sum of sines, which is what the
    app renders, has nothing there and reads below -70 dB.
    """
    spec = spectrogram(a, window=0.372, shape="blackmanharris")
    n = int(max(times) / spec.dt) + 3
    harm = sum(aligned(spec, k * f0, onsets, n) for k in ks) / (3 * len(ks))
    mids = between_harmonics(f0, others)
    noise = np.zeros(n)
    bins = 0
    for hz in mids:
        lo = int(np.searchsorted(spec.f, hz - halfwidth))
        hi = max(lo + 1, int(np.searchsorted(spec.f, hz + halfwidth)))
        rows = spec.power[lo:hi]
        for o in onsets:
            i = int(np.searchsorted(spec.t, o))
            if i + n <= rows.shape[1]:
                noise += rows[:, i : i + n].sum(axis=0)
        bins += hi - lo
    idx = [int(round(t / spec.dt)) for t in times]
    if not bins:
        return np.full(len(times), np.nan)
    return 10 * np.log10((noise / bins)[idx] / harm[idx])


def a_weight_db(f: np.ndarray | float) -> np.ndarray:
    """IEC 61672 A-weighting in dB: 0 at 1 kHz, -19.1 at 100 Hz, -2.5 at 10 kHz."""
    f = np.asarray(f, dtype=float)
    r = (12194**2 * f**4) / (
        (f**2 + 20.6**2) * np.sqrt((f**2 + 107.7**2) * (f**2 + 737.9**2)) * (f**2 + 12194**2)
    )
    return 20 * np.log10(r) + 2.0


def a_weighted(a: Audio) -> Audio:
    """The same audio heard the way loudness meters hear it, so a level in dB
    counts the bloom's 1-2 kHz band for about as much as the ear does and the
    fundamental for less."""
    f1, f2, f3, f4 = 20.598997, 107.65265, 737.86223, 12194.217
    num = [(2 * np.pi * f4) ** 2 * 10 ** (1.9997 / 20), 0, 0, 0, 0]
    den = np.polymul([1, 4 * np.pi * f4, (2 * np.pi * f4) ** 2], [1, 4 * np.pi * f1, (2 * np.pi * f1) ** 2])
    den = np.polymul(np.polymul(den, [1, 2 * np.pi * f3]), [1, 2 * np.pi * f2])
    b, aa = bilinear(num, den, a.sr)
    return Audio(a.path, lfilter(b, aa, a.mono), a.sr)


def erb_bands(n: int = 10, lo: float = 50, hi: float = 7000) -> list[tuple[int, int]]:
    """`n` bands of equal width on the ear's frequency scale (Glasberg and Moore's
    ERB number), so each band covers about as much of what is heard as the next."""
    erb = lambda f: 21.4 * np.log10(1 + 0.00437 * f)
    inv = lambda e: (10 ** (e / 21.4) - 1) / 0.00437
    edges = [int(round(inv(e))) for e in np.linspace(erb(lo), erb(hi), n + 1)]
    return list(zip(edges, edges[1:]))


ERB_BANDS = erb_bands()


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


def analyse(a: Audio, pitches: list[float] | None = None, plucks: Plucks | None = None, name: str = "",
            spec: Spectrogram | None = None) -> Analysis:
    spec = spectrogram(a) if spec is None else spec
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


FEATURE_SCHEMA = 1
# The mix's level curve is resampled onto this many points of the round, so two
# files at different speeds line up feature by feature.
ROUND_POINTS = 24
LABELS = {
    "recording": "Recording",
    "jawari": "Tambura (new)",
    "tambura": "Tambura (classic)",
    "guitar": "Guitar",
    "custom": "Custom (Lab)",
}


def rounded(x, n: int = 2):
    """Plain JSON: arrays become lists, and anything not finite becomes null."""
    if isinstance(x, (list, tuple, np.ndarray)):
        return [rounded(v, n) for v in x]
    v = float(x)
    return round(v, n) if np.isfinite(v) else None


def features(a: Audio, pitches: list[float], plucks: Plucks | None = None, name: str = "",
             kind: str = "recording", render: dict | None = None,
             spec: Spectrogram | None = None) -> dict:
    """Every measurement for one file, as one JSON-ready dict.

    A recording and a render give the same keys in the same places, including
    the ones that couldn't be measured (null rather than absent), so score.py
    can walk two files together and tables.py can print either. `kind` is
    "recording" or "render", and `render` carries the mode and settings from
    the JSON beside a render. Bump FEATURE_SCHEMA when the shape changes;
    committed feature files carry the version they were written with.
    """
    spec = spectrogram(a) if spec is None else spec
    r = analyse(a, pitches, plucks, name=name, spec=spec)
    aw = a_weighted(a)
    own = string_harmonics(pitches)
    used, rnd = r.plucks.times, r.plucks.round
    # Only a player's finger and our damp events stop a string. Where nothing
    # does, the steepest fall is just the ring, so it is left out rather than
    # reported as a lead of several seconds.
    stops = kind == "recording" or any(r.plucks.damps.values())

    onsets = [r.timing[s][0] for s in STRINGS] + [1.0]
    strings = {}
    for s, f0 in (("first", pitches[0]), ("low Sa", pitches[3])):
        ks = own[s]
        others = [p for p in pitches if abs(p - f0) > 1e-6]
        c = r.curves[s]
        erb = string_curves(spec, f0, ks, used[s], TIMES, ERB_BANDS)
        # Another string's pluck is broadband too, so the curve spikes wherever one
        # lands; the median is what to compare.
        noise = noise_curve(a, f0, ks, others, used[s])
        lead = np.median(r.damp_leads[s]) if stops and r.damp_leads[s] else None
        every = plucks.times[s] if plucks else used[s]
        after = lambda d: min((t for t in every if t > d), default=None)
        sched = [after(d) - d for d in r.plucks.damps.get(s, []) if after(d)]
        strings[s] = {
            "harmonics": len(ks),
            "level_db": rounded(c.level, 1),
            "bloom_db": rounded(c.bloom, 1),
            "centroid_hz": rounded(c.centroid, 0),
            "bands_db": {f"{lo}-{hi}": rounded(row, 1) for (lo, hi), row in zip(BANDS, c.bands)},
            "erb_db": {f"{lo}-{hi}": rounded(row, 1) for (lo, hi), row in zip(ERB_BANDS, erb.bands)},
            "noise_db": rounded(noise, 1),
            "noise_median_db": rounded(np.nanmedian(noise), 1),
            "decay": decay_rates(spec, f0, ks, used[s]),
            "inharmonicity": inharmonicity(a, f0, ks, used[s]),
            "damp_lead": {
                "measured_s": rounded(lead, 2) if lead is not None else None,
                "share": rounded(lead / rnd, 3) if lead is not None else None,
                "scheduled_s": rounded(np.median(sched), 2) if sched else None,
            },
        }

    shares = np.linspace(0, 1, ROUND_POINTS, endpoint=False)
    a_offsets, a_db = round_level(aw, used["first"], rnd)
    return {
        "schema": FEATURE_SCHEMA,
        "source": {
            "name": name or a.path.stem,
            "kind": kind,
            "file": a.path.name,
            "seconds": rounded(a.seconds, 1),
            "rate": a.sr,
            "sa_hz": rounded(pitches[1], 2),
            "pitches_hz": {s: rounded(p, 2) for s, p in zip(STRINGS, pitches)},
            "round_seconds": rounded(rnd, 2),
            "plucks": {s: len(used[s]) for s in STRINGS},
            "render": render,
        },
        "timing": {
            "onset_share": {s: [rounded(m, 3), rounded(sd, 3)] for s, (m, sd) in r.timing.items()},
            "gap_share": {
                f"{x} to {y}": rounded(b - a0, 3)
                for x, y, a0, b in zip(STRINGS, STRINGS[1:] + ["first"], onsets, onsets[1:])
            },
        },
        "mix": {
            "round_shares": rounded(shares, 3),
            "round_level_db": rounded(np.interp(shares, r.round_offsets, r.round_db), 1),
            "round_range_db": rounded(-r.round_db.min(), 1),
            "round_level_a_db": rounded(np.interp(shares, a_offsets, a_db), 1),
            "round_range_a_db": rounded(-a_db.min(), 1),
            "pluck_lift_db": {s: [rounded(m, 2), rounded(sd, 2)] for s, (m, sd) in r.lifts.items()},
            "pluck_lift_a_db": {s: rounded(pluck_lift(aw, used[s]), 2) for s in STRINGS if used[s]},
        },
        "times": TIMES,
        "strings": strings,
    }
