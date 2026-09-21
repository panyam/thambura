# Sound analysis

Measures tambura recordings and the app's offline renders side by side. See
[docs/sound-analysis.md](../../docs/sound-analysis.md) for the method, the
steps and the results.

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
(cd ../../web && pnpm render-mix)
.venv/bin/python features.py ../../recordings/renders/jawari.wav -o features/jawari.json
.venv/bin/python score.py features/tambura-C.json features/jawari.json
.venv/bin/python compare.py
```

`features/` holds a feature file per recording and per render, committed so
the tables and the scores can be redone without the audio. `tables.py` writes
the tables in the doc from them, and `make soundtest` runs the tests, which
measure synthetic strings and need no audio at all.
