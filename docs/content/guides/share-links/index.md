---
title: "Share links and presets"
description: "What a Thambura link carries, what happens when someone opens one, and how presets and the built-in sounds are made of links."
next: { title: "The share link format", url: "/thambura/reference/share-link-format/" }
---

Every page has a link that plays what's on it. The address bar keeps it up
to date as you change things, and the thambura's **Copy link** button copies
it. It looks like this:

```
https://thambura.com/?s=AgIBCwEEAQEBAFADQBEwAQENAQgAA0AHETABwjIyPAMBBwFQBENsYXA
```

Everything after `?s=` is the page's setup, packed into a few bytes and
written in URL-safe base64, so a link goes anywhere a URL can. That one is a
page as it first opens, at 55 characters.

## What a link carries

A page can hold several instruments, so its link has a part for each one,
named by the instrument's id on the page:

- **The session** (`session-1`): the tala (with its jaathi, nadai and kalai),
  the speed, and the page's shruthi, meaning the key, fine tune and A4
  everything plays to.
- **The thambura** (`thambura-1`):
  - the sound, meaning the mode (Tambura, Tambura (classic), Guitar, Sruti or
    Custom), gents or ladies, just or equal temperament, the swara the first
    string plays, the round's length, and tone, pluck and sustain;
  - for a Custom sound, the whole plan the Lab edits, string by string,
    including the gaps between plucks;
  - its volume;
  - the view (Mini, Studio, Raagini or Lab). (Links made before the track
    list also say whether the thambura's drawer was open; nothing reads that
    any more.)
- **The kriyas** (`hands-1`): the sound group (Clap or Metronome) and their
  volume.
- **Each kit** (`kit-1`, `kit-2`, …): which of the page's kits it is,
  Variety, its volume, and whether it plays along with the tala.

The thambura's part is a whole link of its own, the kind every link was
before pages had more than one instrument, so everything below about the
thambura's sound holds inside a page link too.

Every instrument's volume is in the link, so it opens with the balance its
sender heard. (Links made before
[#153](https://github.com/panyam/thambura/issues/153) leave the thambura's
out, and it plays at the listener's own.) A few things are left out on
purpose. Solo (the Lab's on/off dots) is for working on one string at a
time, and a link that silenced three strings would mostly confuse whoever
opened it. The track list's mute and solo stay out of links for the same
reason.

## Opening a link

When someone opens a page with a `?s=` link:

- Each instrument plays its part of the link, over what their browser had
  saved, volumes included.
- The session's shruthi is the one played, even though the thambura's part
  carries a key of its own.
- On a page with a track list (the home page), the parts a link has are the
  instruments the page opens with (the kriyas are always there). A page
  without one (`/labs/side-by-side`, an embed) always has its own set, and
  plays what the link says for each of them.
- If it changes the sound they had, their own setup is kept first, as a
  preset called **Before shared link**. Only the latest one is kept, so
  opening links all day doesn't pile them up.
- A note in the thambura's panel says "Opened a shared setup."
- Nothing is saved over their own setup until they change something
  themselves.
- A part this version doesn't know (from a newer version, say) is skipped,
  and the rest of the page still opens. A link it can't read at all (a
  mistyped one) plays their own setup instead, and the note says so.
- Links from before pages had parts (a thambura setup on its own, like
  `?s=AQgAA0AHETABwjIyPA`) still open, as the thambura's part.

## Custom sounds, and built-in sounds that change

Writing out a whole Custom plan would make for long links, so a Custom link
names the built-in sound its plan is closest to (Tambura, Tambura (classic)
or Guitar) and stores only what's different. Most Lab edits then cost a
byte or two each.

That makes a Custom link depend on the built-in sound as it was when the
link was made, and the built-in sounds do change: the Tambura voice was
fitted to a recording, and may well be fitted again. So the link also carries a short
checksum of the built-in sound it started from. If a later release has
changed that sound, the link still opens, and the note adds that it "was made
from an older version of a built-in sound, so it may sound a little
different."

Two things are worth knowing here:

- **Plain links follow the built-in sounds.** A link that says "Tambura"
  names the sound rather than copying it, so it always plays the current
  version. That's deliberate, since an improved voice then reaches every
  link that uses it.
- **Older Custom links see less.** Links made before
  [#121](https://github.com/panyam/thambura/issues/121) have a checksum
  that covers the values the Lab shows but not a few it hides (how long
  each string's sample is rendered, its tail fade and its highest
  harmonic), so a change to one of those in a built-in sound reaches them
  without the note. Links made since cover those too.

## Presets

A preset is a thambura sound: a name and a thambura link, nothing more.
It doesn't carry the tala, the speed, the shruthi or the other instruments,
so a preset works on any page and at any pitch. In the Lab, **Save** writes the
current sound over the preset that's playing, and **Save as…** keeps it as a
new one. Presets are kept in the browser under `thambura.presets`, apart
from the settings, up to 200 of them. Picking one from the Sound menu plays
its sound, but leaves the view, the volume and the page's shruthi alone.

Since a preset is a link, **Copy** gives it to anyone, and the built-in
presets are made the same way. Shimmer and Warm, in the Sound menu beside
the built-in modes, are two links in
[`web/src/engine/presets.ts`](https://github.com/panyam/thambura/blob/master/web/src/engine/presets.ts).
They can't be renamed, deleted or written over, so Save is refused on them
and Save as… keeps your version.

## Suggesting a built-in preset

If you've made a sound you think others would like, find it in the Lab's
preset list and press **Share**. It opens the
[share-a-preset](https://github.com/panyam/thambura/issues/new?template=share-a-preset.yml)
issue form with the link and name filled in, and asks what makes it good and
what you were listening on. If we take it, its link goes into
`BUILT_IN_PRESETS` as it is, and a test checks that every built-in preset
opens without the "older version" notice.

## Making links in code

Everything behind this is in
[`web/src/engine/shareLink.ts`](https://github.com/panyam/thambura/blob/master/web/src/engine/shareLink.ts).
A thambura's own link, which is what a preset holds and what goes in a page
link's `thambura-1` part:

```ts
import { decodeLink, encodeLink } from "./engine/shareLink";
import { DEFAULT_THAMBURA } from "./engine/shruthi";
import { planFor } from "./engine/thamburaPlan";

const settings = { ...DEFAULT_THAMBURA, key: 4, cycleSeconds: 3 };
const link = encodeLink({ settings, custom: planFor(settings), view: "studio" });

// decodeLink fills in what a link leaves out (an older link's volume) from
// the settings you pass, and returns null for anything it can't read.
const opened = decodeLink(link, { settings: DEFAULT_THAMBURA });
```

A page link is its parts, each an instrument's own link keyed by its id.
`encodeSession`, `encodeHands` and `encodeKit` make the other parts, and
each has a `decode…` to go with it:

```ts
import { decodePage, encodeHands, encodePage, encodeSession } from "./engine/shareLink";
import { DEFAULT_SETTINGS, DEFAULT_TEMPO } from "./engine/selection";
import { DEFAULT_PITCH } from "./engine/shruthi";

const page = encodePage([
  { id: "session-1", link: encodeSession({ tala: DEFAULT_SETTINGS, tempo: DEFAULT_TEMPO, pitch: DEFAULT_PITCH }) },
  { id: "thambura-1", link },
  { id: "hands-1", link: encodeHands({ soundGroup: "Clap", volume: 80 }) },
]);

// The parts by id, or null for anything it can't read. An old thambura-only
// link comes back as its thambura-1 part.
const parts = decodePage(page);
```

They're pure TypeScript with no DOM, so they run anywhere. They're also
still internal to this repo, and will move with the rest of the engine when
it's lifted into its own library
([#53](https://github.com/panyam/thambura/issues/53)).

The bytes themselves, and the rules for changing them, are in
[The share link format]({{ .Site.PathPrefix }}/reference/share-link-format/).
