"""Synthetic tambura-shaped audio, so the measurements can be checked against
numbers we chose rather than against a recording nobody can commit."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

import soundlab as sl

SR = 22050


def string(seconds: float, f0: float, onsets: list[float], t60: float = 6.0, damping: float = 0.0,
           harmonics: int = 12, b: float = 0.0, level: float = 1.0, rolloff: float = 1.0,
           attack: float = 0.03, sr: int = SR) -> np.ndarray:
    """One plucked string: `harmonics` partials, each decaying to -60 dB in `t60`
    seconds and `damping` faster per harmonic, at k f0 sqrt(1 + b k²). The partials
    rise over `attack`, since a step lands in every frequency at once and makes
    one string's pluck look like every string's."""
    t = np.arange(int(seconds * sr)) / sr
    x = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        hz = k * f0 * np.sqrt(1 + b * k * k)
        tau = (t60 / np.log(1000)) / (1 + damping * (k - 1))
        for o in onsets:
            on = t >= o
            since = t[on] - o
            x[on] += ((level / k**rolloff) * (1 - np.exp(-since / attack)) * np.exp(-since / tau)
                      * np.sin(2 * np.pi * hz * since))
    return x


def audio(x: np.ndarray, sr: int = SR, name: str = "synthetic.wav") -> sl.Audio:
    return sl.Audio(Path(name), x, sr)


@pytest.fixture(scope="session")
def mix(tmp_path_factory) -> tuple[sl.Audio, sl.Plucks, list[float], Path]:
    """Four strings at C, plucked like the app's jawari round, with the WAV and the
    JSON `pnpm render-mix` writes beside it."""
    sa, rnd, seconds = 131.0, 6.0, 30.0
    pitches = sl.string_pitches(sa)
    shares = [0.0, 0.3, 0.5, 0.7]
    times = {s: [round(r * rnd + sh * rnd, 3) for r in range(1, int(seconds / rnd) - 1)]
             for s, sh in zip(sl.STRINGS, shares)}
    x = np.zeros(int(seconds * SR))
    for s, f0 in zip(sl.STRINGS, pitches):
        x += string(seconds, f0, times[s], t60=6.0, damping=0.02, harmonics=20, level=0.5)
    wav = tmp_path_factory.mktemp("mix") / "synthetic.wav"
    sf.write(wav, x, SR)
    wav.with_suffix(".json").write_text(json.dumps({
        "mode": "synthetic",
        "settings": {"cycleSeconds": rnd, "tone": 50},
        "sampleRate": SR,
        "frequencies": pitches,
        "events": [{"time": t, "string": i, "gain": 1.0}
                   for i, s in enumerate(sl.STRINGS) for t in times[s]],
    }))
    return sl.load(wav), sl.Plucks(times, rnd), pitches, wav


@pytest.fixture(scope="session")
def mix_features(mix) -> dict:
    a, plucks, pitches, _ = mix
    return sl.features(a, pitches, plucks, name="synthetic", kind="render",
                       render={"mode": "synthetic", "settings": {"cycleSeconds": plucks.round}})
