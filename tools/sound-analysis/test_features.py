"""features.py: one schema for a recording and for a render, either way in."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

import soundlab as sl

HERE = Path(__file__).resolve().parent


def shape(x):
    """Which keys the file has, ignoring what they hold. A measurement that
    couldn't be made is null in its usual place rather than missing, so the
    shape of a recording's file and a render's file have to match exactly."""
    return {k: shape(v) for k, v in x.items()} if isinstance(x, dict) else "leaf"


def run(*args) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(HERE / "features.py"), *map(str, args)],
                          capture_output=True, text=True, cwd=HERE)


def test_a_recording_and_a_render_carry_the_same_keys(mix):
    a, plucks, pitches, _ = mix
    render = sl.features(a, pitches, plucks, name="r", kind="render",
                         render={"mode": "synthetic", "settings": {"cycleSeconds": plucks.round}})
    recording = sl.features(a, pitches, plucks, name="r", kind="recording")
    # source.render is whatever render-mix wrote, passed through, and a recording
    # has none of it; everything else is measured and has to line up.
    for f in (render, recording):
        f["source"].pop("render")
    assert shape(recording) == shape(render)


def test_every_measurement_is_json(mix_features):
    assert json.loads(json.dumps(mix_features)) == mix_features
    assert mix_features["schema"] == sl.FEATURE_SCHEMA


def test_the_measurements_describe_the_string_they_were_given(mix_features):
    first = mix_features["strings"]["first"]
    # The fixture's strings ring 6 s, its 20th harmonic about 4.4 s, so the
    # median over the harmonics lands between them, give or take what the other
    # three strings leak into the measurement.
    assert 4.0 < first["decay"]["median_s"] < 7.0
    assert first["decay"]["fundamental_s"] == pytest.approx(6.0, rel=0.2)
    # Exact harmonics go in. The other three strings' harmonics pull the peaks a
    # little, which is what a fifth of a cent at harmonic 20 is.
    assert first["inharmonicity"]["cents_at_20"] < 0.5
    assert first["noise_median_db"] < -50  # and nothing between them
    assert mix_features["timing"]["gap_share"]["first to Sa 1"] == pytest.approx(0.3, abs=0.01)


def test_a_render_brings_its_pluck_times_and_settings(mix, tmp_path):
    _, plucks, _, wav = mix
    out = tmp_path / "render.json"
    assert run(wav, "-o", out).returncode == 0
    f = json.loads(out.read_text())
    assert f["source"]["kind"] == "render"
    assert f["source"]["render"]["mode"] == "synthetic"
    assert f["source"]["round_seconds"] == plucks.round
    # Plucks in the first and last 6 s are dropped, as a recording fades in there.
    assert f["source"]["plucks"]["first"] >= 2  # the rest are in the fade-in or the tail


def test_a_recording_is_measured_from_its_plucks(mix, tmp_path):
    a, plucks, pitches, wav = mix
    alone = tmp_path / "recording.wav"  # no JSON beside it, so the plucks are found
    alone.write_bytes(Path(wav).read_bytes())
    out = tmp_path / "recording.json"
    assert run(alone, "--sa", pitches[1], "-o", out).returncode == 0
    f = json.loads(out.read_text())
    assert f["source"]["kind"] == "recording"
    assert f["source"]["render"] is None
    assert f["source"]["round_seconds"] == plucks.round
    # Plucks in the first and last 6 s are dropped, as a recording fades in there.
    assert f["source"]["plucks"]["first"] >= 2
    # Which string a pluck belongs to is worked out from what else is ringing, and
    # four synthetic strings of pure harmonics leak into each other far more than
    # a real tambura does. The recording is where that part is judged, in the
    # tables in docs/designs/sound-analysis.md.


def test_a_recording_without_sa_says_so(mix, tmp_path):
    _, _, _, wav = mix
    alone = tmp_path / "recording.wav"
    alone.write_bytes(Path(wav).read_bytes())
    done = run(alone)
    assert done.returncode == 2
    assert "--sa" in done.stderr
