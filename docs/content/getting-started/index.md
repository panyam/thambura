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

A page is made of **islands** and **instruments**. An island is a view,
something you see and press, mounted into a slot the page's layout
provides. An instrument is something that plays. The two are kept apart
because they come and go differently: a page's islands are fixed by its
layout, while instruments can be added and removed in the browser.

The home page has two islands:

- **tala**, the tala keeper, across the top of the page. It counts a
  tala's beats at a tempo, with the nadai's ticks inside each beat, and
  shows an image for each beat. Beside the image on a wide screen (under it
  on a phone) is the **session strip**, with the page's speed, its shruthi
  (the Sa everything plays to) and a Start all button.
- **tracks**, the track list under the tala: a full-width row for each
  instrument on the page, with its main controls, level, mute and solo, and
  a toggle that opens its full panel. Add and Remove change which are
  playing. The thambura's panel has four views over the same sound (Mini,
  Studio, a Raagini replica and a Lab for editing the sound string by
  string).

and three kinds of instrument:

- **the kriyas**, the tala's hand actions heard: its claps, waves and
  finger counts, as a clap or a metronome tick. The tala itself makes no
  sound; it says when each beat falls, and the kriyas play it.
- **the thambura**, which plucks its four strings in a round, or holds a
  sruti box's reed tone, at the page's shruthi.
- **a kit** for each struck instrument installed, such as the mridangam. A
  kit is a `kit.json` manifest naming its strokes and the recorded takes of
  each, which the code plays without knowing anything about that particular
  drum. What it plays comes from **patterns**, written in the
  [notations](https://github.com/panyam/notations) language and matched to
  a tala by the shape of its cycle.

Each instrument has an id on the page (`hands-1`, `thambura-1`, `kit-1`)
and its own audio track, and they all share one clock, so the kriyas and the
drum land on the same beats and the drum follows the thambura's Sa.
The home page shows them as a track list, a row per instrument, where you
can add, remove, mute and solo them.

Under all of it sits the **engine**, plain TypeScript with no DOM, audio or
timers: the tala tables, exact fractions for every musical position, the
tempo map that turns counts into seconds, and the sequencers that say what
sounds when. It's what the planned libraries will be lifted from
([#53](https://github.com/panyam/thambura/issues/53)).

## How a page is put together

The server describes each page with a **page spec**: a layout, the islands
to mount (a name, a slot, how it's presented, and its config) and the
instruments to start with (a kind and its config). It writes the spec into
the page as JSON, and the browser mounts each island from a registry of
factories by name and numbers the instruments by kind. The home page's spec,
on a server with the mridangam kit installed, is:

```json
{
  "layout": "tracks",
  "islands": [
    { "name": "tala", "slot": "main", "presentation": "page",
      "config": { "fixturesUrl": "/static/Resources/TalasFixtures.json", "instrumentControls": false, "wide": true } },
    { "name": "tracks", "slot": "tracks", "presentation": "page" }
  ],
  "instruments": [
    { "kind": "hands", "config": { "fixturesUrl": "/static/Resources/TalasFixtures.json" } },
    { "kind": "thambura", "added": true },
    { "kind": "kit", "config": { "url": "/static/Resources/Kits/compmusic/kit.json" } }
  ]
}
```

The instruments are what the page can have. Which of them are on it is the
track list's business in the browser: a new visitor starts with the kriyas and
the thambura and adds the mridangam from the list.

A missing config is an empty one. `added` marks what a new listener starts
with; on a page with a track list the rest wait under + Add. An island the registry doesn't know, or a
slot that isn't on the page, is logged and skipped, so one bad entry doesn't
stop the rest of the page.

The same spec is how the islands go on **someone else's page**. A host
writes a spec in a `data-thambura-spec` script, a `data-thambura-slot`
element for each island, and loads `embed.js` from our site. Each island
mounts in a shadow root with our styles, so the host's CSS and ours stay
apart, and everything it loads (sounds, images, the Lab's code) comes from
our site. [`/embed/demo`](https://thambura.com/embed/demo) is a page written
that way, and [Embed Thambura in your page]({{ .Site.PathPrefix }}/guides/embed/)
walks through it.

Each page also keeps its whole setup in a link, one part per instrument
plus the session. [Share links and presets]({{ .Site.PathPrefix }}/guides/share-links/)
covers what's in one.

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
