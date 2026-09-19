# Sound analysis

Measures tambura recordings and the app's offline renders side by side. See
[docs/sound-analysis.md](../../docs/sound-analysis.md) for the method, the
steps and the results.

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
(cd ../../web && pnpm render-mix)
.venv/bin/python compare.py
```
