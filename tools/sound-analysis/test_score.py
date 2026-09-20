"""score.py: one distance, and a breakdown that says which feature moved."""

import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

import score

HERE = Path(__file__).resolve().parent


def group(result: dict, key: str) -> dict:
    return next(g for g in result["groups"] if g["key"] == key)


def test_a_sound_scores_zero_against_itself(mix_features):
    r = score.compare(mix_features, copy.deepcopy(mix_features))
    assert r["total"] == pytest.approx(0.0)
    assert all(g["distance"] == pytest.approx(0.0) for g in r["groups"] if g["distance"] is not None)


def test_a_quieter_pluck_shows_up_as_a_quieter_pluck(mix_features):
    other = copy.deepcopy(mix_features)
    other["mix"]["pluck_lift_db"]["Sa 2"][0] -= 1.6
    r = score.compare(mix_features, other)
    lift = group(r, "lift")
    assert lift["worst"] == "Sa 2"
    assert lift["delta"] == pytest.approx(-1.6)
    assert r["total"] > 0
    assert group(r, "bloom")["distance"] == pytest.approx(0.0)


def test_the_tolerance_sets_what_counts_as_close(mix_features):
    target, near, far = (copy.deepcopy(mix_features) for _ in range(3))
    for s in score.MEASURED:
        target["strings"][s]["damp_lead"]["share"] = 0.10
        near["strings"][s]["damp_lead"]["share"] = 0.12  # half a tolerance
        far["strings"][s]["damp_lead"]["share"] = 0.18  # two of them
    assert group(score.compare(target, near), "damp")["distance"] == pytest.approx(0.5)
    assert group(score.compare(target, far), "damp")["distance"] == pytest.approx(2.0)


def test_the_buzz_is_reported_but_left_out_of_the_total(mix_features):
    other = copy.deepcopy(mix_features)
    for s in score.MEASURED:
        other["strings"][s]["noise_median_db"] += 40
    r = score.compare(mix_features, other)
    assert group(r, "buzz")["distance"] > 6
    assert r["total"] == pytest.approx(0.0)


def test_a_feature_neither_file_has_is_not_counted_as_a_match(mix_features):
    other = copy.deepcopy(mix_features)
    for s in score.MEASURED:
        other["strings"][s]["decay"]["median_s"] = None
    r = score.compare(mix_features, other)
    assert group(r, "ring")["distance"] is None
    assert score.phrase(group(r, "ring")) == "not measured in both"
    assert r["total"] == pytest.approx(0.0)


def test_a_string_that_rings_on_is_scored_as_never_stopped(mix_features):
    target, other = copy.deepcopy(mix_features), copy.deepcopy(mix_features)
    for s in score.MEASURED:
        target["strings"][s]["damp_lead"]["share"] = 0.04
        other["strings"][s]["damp_lead"]["share"] = None
    assert group(score.compare(target, other), "damp")["distance"] == pytest.approx(1.0)


def test_the_command_prints_a_breakdown_and_the_same_numbers_as_json(mix_features, tmp_path):
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    a.write_text(json.dumps(mix_features))
    other = copy.deepcopy(mix_features)
    other["source"]["name"] = "louder"
    other["mix"]["pluck_lift_db"]["Sa 2"][0] += 3.0
    b.write_text(json.dumps(other))
    run = lambda *extra: subprocess.run([sys.executable, str(HERE / "score.py"), str(a), str(b), *extra],
                                        capture_output=True, text=True, cwd=HERE)
    text = run()
    assert text.returncode == 0
    assert "louder against synthetic" in text.stdout
    assert "pluck lift" in text.stdout
    assert json.loads(run("--json").stdout)["total"] == pytest.approx(
        score.compare(mix_features, other)["total"])
