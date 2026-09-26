---
title: "Reference"
description: "The engine's API, and the formats other code reads and writes."
---

The engine's API reference waits until the engine moves into its own
libraries ([#53](https://github.com/panyam/thambura/issues/53)), so it
documents names that will last. It is tracked in
[#111](https://github.com/panyam/thambura/issues/111).

## Formats

- [The share link format]({{ .Site.PathPrefix }}/reference/share-link-format/): the bytes behind a `?s=` link, and the rules for changing them.

## The engine, until then

The engine lives in
[`web/src/engine`](https://github.com/panyam/thambura/tree/master/web/src/engine),
pure TypeScript with unit tests beside each file, and the tests are the most
exact description of what each part does. The design notes in
[`docs/designs`](https://github.com/panyam/thambura/tree/master/docs/designs)
explain how the parts fit.
