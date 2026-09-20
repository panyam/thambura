"""tables.py: the doc's tables, from the feature files and nothing else."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

import tables

HERE = Path(__file__).resolve().parent
DOC = "before\n\n<!-- generated: {name} -->\nstale\n<!-- /generated -->\n\nafter\n"


@pytest.fixture
def library(tmp_path, mix_features) -> Path:
    folder = tmp_path / "features"
    folder.mkdir()
    (folder / "jawari.json").write_text(json.dumps(mix_features))
    return folder


def test_every_block_the_doc_asks_for_is_a_markdown_table(library):
    blocks = tables.rendered(tables.load(library))
    assert set(blocks) == set(tables.BLOCKS)
    for body in blocks.values():
        rows = body.splitlines()
        assert rows[1].startswith("|---")
        assert all(r.startswith("| ") and r.endswith(" |") for r in rows[:1] + rows[2:])


def test_a_table_holds_what_the_feature_file_measured(library, mix_features):
    timing = tables.rendered(tables.load(library))["timing"]
    assert "Tambura (new)" in timing.splitlines()[0]
    assert f"{mix_features['timing']['onset_share']['Sa 1'][0]:.3f}" in timing


def test_substitute_replaces_a_block_and_leaves_the_rest_alone():
    doc = DOC.format(name="timing")
    out = tables.substitute(doc, {"timing": "| a | b |"})
    assert "stale" not in out
    assert out.startswith("before") and out.endswith("after\n")
    assert "<!-- generated: timing -->\n| a | b |\n<!-- /generated -->" in out


def test_substitute_fills_a_block_that_is_still_empty():
    out = tables.substitute("<!-- generated: timing -->\n<!-- /generated -->\n", {"timing": "| a | b |"})
    assert out == "<!-- generated: timing -->\n| a | b |\n<!-- /generated -->\n"


def test_a_doc_missing_a_block_is_an_error():
    with pytest.raises(SystemExit):
        tables.substitute("no markers here", {"timing": "| a | b |"})


def run(*args, folder: Path, doc: Path) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(HERE / "tables.py"), "--features", str(folder),
                           "--doc", str(doc), *args], capture_output=True, text=True, cwd=HERE)


def test_check_fails_on_a_stale_doc_and_passes_once_it_is_written(library, tmp_path):
    doc = tmp_path / "doc.md"
    doc.write_text("".join(DOC.format(name=name) for name in tables.BLOCKS))
    assert run("--check", folder=library, doc=doc).returncode == 1
    assert run(folder=library, doc=doc).returncode == 0
    assert run("--check", folder=library, doc=doc).returncode == 0
    assert "stale" not in doc.read_text()
