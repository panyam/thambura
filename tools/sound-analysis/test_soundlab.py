"""The measurements features.py packs into a feature file, each against a
synthetic string whose T60, stiffness and noise we chose."""

import numpy as np
import pytest

import soundlab as sl
from conftest import SR, audio, string


def test_decay_rates_recover_a_known_t60():
    a = audio(string(6.0, 100.0, [0.0], t60=6.0, harmonics=10))
    d = sl.decay_rates(sl.spectrogram(a), 100.0, list(range(1, 11)), [0.0])
    assert d["harmonics"] >= 8
    for _, _, t60 in d["per_harmonic"]:
        assert t60 == pytest.approx(6.0, rel=0.15)
    assert d["median_s"] == pytest.approx(6.0, rel=0.1)


def test_decay_rates_recover_how_much_faster_the_upper_harmonics_fall():
    a = audio(string(6.0, 100.0, [0.0], t60=9.0, damping=0.05, harmonics=10))
    d = sl.decay_rates(sl.spectrogram(a), 100.0, list(range(1, 11)), [0.0])
    assert d["fundamental_s"] == pytest.approx(9.0, rel=0.15)
    assert d["damping"] == pytest.approx(0.05, rel=0.3)


def test_inharmonicity_recovers_a_known_stiffness():
    a = audio(string(4.0, 100.0, [0.0], b=1e-4, harmonics=30))
    got = sl.inharmonicity(a, 100.0, list(range(1, 31)), [0.0])
    assert got["b"] == pytest.approx(1e-4, rel=0.2)
    assert got["cents_at_20"] == pytest.approx(34, abs=4)


def test_inharmonicity_reads_zero_for_exact_harmonics():
    a = audio(string(4.0, 100.0, [0.0], harmonics=30))
    got = sl.inharmonicity(a, 100.0, list(range(1, 31)), [0.0])
    assert got["cents_at_20"] < 0.1
    assert got["tuning_cents"] == pytest.approx(0, abs=1)


def test_inharmonicity_is_not_dragged_by_a_peak_that_isnt_a_harmonic():
    """A neighbour 3 cents off pulls the pitch, and the stiffness follows to keep
    the upper harmonics fitting, which is how a 60 s recording of four strings
    came back reading like a piano."""
    a = audio(string(4.0, 100.0, [0.0], harmonics=25)
              + 0.3 * string(4.0, 99.8, [0.0], harmonics=1))
    got = sl.inharmonicity(a, 100.0, list(range(1, 26)), [0.0])
    assert got["cents_at_20"] < 1.0
    assert got["f0_hz"] == pytest.approx(100.0, abs=0.1)


def test_inharmonicity_reports_the_tuning_it_was_asked_about():
    a = audio(string(4.0, 101.0, [0.0], harmonics=20))
    got = sl.inharmonicity(a, 100.0, list(range(1, 21)), [0.0])
    assert got["tuning_cents"] == pytest.approx(17.2, abs=2)


def test_noise_curve_hears_a_buzz_that_a_sum_of_sines_doesnt_have():
    clean = string(6.0, 100.0, [0.0], harmonics=20)
    rng = np.random.default_rng(7)
    noisy = clean + 0.02 * rng.standard_normal(len(clean)) * np.exp(-np.arange(len(clean)) / SR / 2)
    ks = list(range(1, 21))
    quiet = sl.noise_curve(audio(clean), 100.0, ks, [], [0.0])
    buzzy = sl.noise_curve(audio(noisy), 100.0, ks, [], [0.0])
    assert np.nanmedian(quiet) < -60
    assert np.nanmedian(buzzy) > np.nanmedian(quiet) + 20


def test_between_harmonics_keeps_clear_of_every_string():
    pitches = sl.string_pitches(131.05)
    first, sa, _, low = pitches
    spots = sl.between_harmonics(first, [sa, low])
    assert spots
    for hz in spots:
        assert min(abs(hz - round(hz / o) * o) for o in (first, sa, low)) >= 20
    assert sl.between_harmonics(first, [sa, low], gap=40) == []


def test_a_weighting_matches_the_standard():
    assert sl.a_weight_db(1000) == pytest.approx(0.0, abs=0.05)
    assert sl.a_weight_db(100) == pytest.approx(-19.1, abs=0.2)
    assert sl.a_weight_db(10000) == pytest.approx(-2.5, abs=0.2)


@pytest.mark.parametrize("hz", [100, 1000, 4000])
def test_the_a_weighting_filter_follows_the_curve(hz):
    t = np.arange(int(3 * SR)) / SR
    tone = audio(np.sin(2 * np.pi * hz * t))
    settled = slice(SR, None)
    plain = np.sqrt(np.mean(tone.mono[settled] ** 2))
    weighted = np.sqrt(np.mean(sl.a_weighted(tone).mono[settled] ** 2))
    assert 20 * np.log10(weighted / plain) == pytest.approx(sl.a_weight_db(hz), abs=0.5)


def test_erb_bands_widen_with_frequency():
    bands = sl.erb_bands(6, 50, 7000)
    widths = [hi - lo for lo, hi in bands]
    assert bands[0][0] == 50 and bands[-1][1] == 7000
    assert widths == sorted(widths)
