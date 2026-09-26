---
title: "Getting started"
description: "What Thambura is made of, how a page is put together, and where to go next."
---

Thambura runs in the browser. The Go server sends a page and its
settings, and everything after that, from timing the beats to rendering the
drone, happens in JavaScript on the listener's machine. There are no
accounts and no server-side data: a listener's settings live in their
browser, and a setup is shared as a link.

## The pieces

A page is made of **islands**, each a self-contained UI mounted into a slot
the page's layout provides. The home page has two:

- **tala**, the tala keeper. It counts a tala's beats at a tempo, with the
  nadai's ticks inside each beat, and shows an image for each beat.
- **thambura**, the drone, in a bar that slides up from the bottom of the
  page. It plucks the four strings in a round, or holds a sruti box's
  reed tone, at the listener's Sa. It has four views over the same sound
  (Mini, Studio, a Raagini replica and a Lab for editing the sound string
  by string).

The islands share one audio engine and one clock, so the percussion lands
on the tala's beats and follows the thambura's Sa.

**Instruments** are the other half. A struck instrument such as the
mridangam is a **kit**: a `kit.json` manifest naming its strokes and the
recorded takes of each, which the code plays without knowing anything about
that particular drum. What it plays comes from **patterns**, written in the
[notations](https://github.com/panyam/notations) language and matched to a
tala by the shape of its cycle.

Under both sits the **engine**, plain TypeScript with no DOM, audio or
timers: the tala tables, exact fractions for every musical position, the
tempo map that turns counts into seconds, and the sequencers that say what
sounds when. It is what the planned libraries will be lifted from (#53).

## How a page is put together

The server describes each page with a **page spec**: a layout, the islands to
mount (a name, a slot, how it is presented, and its config) and the
instruments to start with. It writes the spec into the page as JSON, and the
browser mounts each island from a registry of factories by name. The home
page's spec is roughly:

```json
{
  "layout": "drawer",
  "islands": [
    { "name": "tala", "slot": "main", "presentation": "page",
      "config": { "fixturesUrl": "/static/Resources/TalasFixtures.json" } },
    { "name": "thambura", "slot": "drawer", "presentation": "drawer", "config": {} }
  ],
  "instruments": [
    { "kind": "kit", "config": { "url": "/static/Resources/Kits/compmusic/kit.json" } }
  ]
}
```

An island the registry doesn't know, or a slot that isn't on the page, is
logged and skipped, so one bad entry doesn't stop the rest of the page.

The spec is how other pages will reuse the islands. That work is under way
(#89, #92), and the embedding guide will follow once it settles.

## Run it locally

You need Go, Node with pnpm, and `make`.

```sh
git clone https://github.com/panyam/thambura
cd thambura
make run          # builds the frontend, then serves on :8000
make docsrun      # serves these pages on :8012 as you edit them
```

`make test` is the whole gate: the Go tests, type checks, the vitest suite,
and a build of this site with every link checked.

## Where to go next

- [Guides]({{ .Site.PathPrefix }}/guides/) for adding an instrument, writing a pattern and
  sharing a setup, as they are written.
- [Reference]({{ .Site.PathPrefix }}/reference/) for the engine's API, after the lift.
- The design notes in the repo explain why things are the way they are:
  [architecture](https://github.com/panyam/thambura/blob/master/docs/designs/architecture.md)
  covers how sounds are made and timed, and
  [mridangam](https://github.com/panyam/thambura/blob/master/docs/designs/mridangam.md)
  covers kits and patterns.
