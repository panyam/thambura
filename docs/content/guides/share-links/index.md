---
title: "Share links and presets"
description: "What a thambura link carries, what happens when someone opens one, and how presets and the built-in sounds are made of links."
next: { title: "The share link format", url: "/thambura/reference/share-link-format/" }
---

Every thambura setup has a link. The address bar keeps it up to date as you
change things, and the bar's **Copy link** button copies it. It looks like
this:

```
https://thambura.com/?s=AQgAA0AHETABwjIyPA
```

Everything after `?s=` is the setup, packed into a few bytes and written in
URL-safe base64, so a link goes anywhere a URL can. An everyday setup comes
to about 18 characters, and a Custom sound edited on every string still
stays under 200.

## What a link carries

- **The sound:** the mode (Tambura, Tambura (classic), Guitar, Sruti or
  Custom), the key and fine tune, gents or ladies, just or equal
  temperament, A4, the swara the first string plays, the round's length, and
  tone, pluck and sustain.
- **For a Custom sound, the whole plan** the Lab edits, string by string,
  including the gaps between plucks.
- **The view** (Mini, Studio, Raagini or Lab) and whether the bar was open.

Two things are left out on purpose. The volume depends on the listener's
room and speakers rather than on the sound, so a link never changes it. Solo
(the Lab's on/off dots) is for working on one string at a time, and a link
that silenced three strings would mostly confuse whoever opened it.

## Opening a link

When someone opens a page with a `?s=` link:

- The link wins over what their browser had saved, apart from the volume,
  which stays theirs.
- If it changes the sound they had, their own setup is kept first, as a
  preset called **Before shared link**. Only the latest one is kept, so
  opening links all day doesn't pile them up.
- A note in the thambura's bar says "Opened a shared setup."
- Nothing is saved over their own setup until they change something
  themselves.
- A link this version can't read (a mistyped one, say, or one from a newer
  format) plays their own setup instead, and the note says so.

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
- **The checksum doesn't cover everything yet.** It covers the values the Lab
  shows, but not a few it hides (how long each string's sample is rendered,
  its tail fade and its highest harmonic), so a change to one of those in a
  built-in sound reaches old Custom links without the notice. That's
  [#121](https://github.com/panyam/thambura/issues/121).

## Presets

A preset is a name and a link, nothing more. In the Lab, **Save** writes the
current sound over the preset that's playing, and **Save as…** keeps it as a
new one. Presets are kept in the browser under `thambura.presets`, apart
from the settings, up to 200 of them. Picking one from the Sound menu plays
its sound, but leaves the view and the volume alone.

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

The two functions behind all of this are in
[`web/src/engine/shareLink.ts`](https://github.com/panyam/thambura/blob/master/web/src/engine/shareLink.ts):

```ts
import { decodeLink, encodeLink } from "./engine/shareLink";
import { DEFAULT_THAMBURA } from "./engine/shruthi";
import { planFor } from "./engine/thamburaPlan";

const settings = { ...DEFAULT_THAMBURA, key: 4, cycleSeconds: 3 };
const link = encodeLink({ settings, custom: planFor(settings), view: "studio" });

// decodeLink fills in what a link leaves out (the volume) from the settings
// you pass, and returns null for anything it can't read.
const opened = decodeLink(link, { settings: DEFAULT_THAMBURA });
```

They're pure TypeScript with no DOM, so they run anywhere. They're also
still internal to this repo, and will move with the rest of the engine when
it's lifted into its own library
([#53](https://github.com/panyam/thambura/issues/53)).

The bytes themselves, and the rules for changing them, are in
[The share link format]({{ .Site.PathPrefix }}/reference/share-link-format/).
