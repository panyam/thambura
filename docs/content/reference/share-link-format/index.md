---
title: "The share link format"
description: "The bytes behind a thambura ?s= link, how each value is stored, and the rules for changing the format without breaking links people already have."
prev: { title: "Share links and presets", url: "/thambura/guides/share-links/" }
---

This page describes format 1, one thambura's setup, and format 2, a page
link that carries every instrument on the page as its own part, plus a
session part for what the page shares: the tala, its speed and the shruthi.
A page with a tala always writes format 2. It's for anyone
changing
[`web/src/engine/shareLink.ts`](https://github.com/panyam/thambura/blob/master/web/src/engine/shareLink.ts),
or reading links outside the app. For what a link means to the person
opening it, see [Share links and presets]({{ .Site.PathPrefix }}/guides/share-links/).
The code is the authority (the FIELDS table below was generated from it),
so if the two ever disagree, the page is wrong.

## Overview

A link's `s` parameter is a string of bytes written as base64url without
padding. The first byte is the format number. A `1` is one thambura's
setup: the next twelve bytes hold the settings every link has, and a Custom
link then carries its plan. A `2` is a page link, made of parts (see
"Page links" below), and anything else isn't read.

A reader must use up every byte. A link with bytes left over, or one that
runs out early, is rejected as a whole, so the listener's own setup plays
instead of half of someone else's.

## The settings

| Byte | Holds | Stored as |
| --- | --- | --- |
| 0 | Format | `1` |
| 1 | Flags | bit 0 equal temperament, bit 1 ladies, bit 2 bar open, bits 3-5 the view |
| 2 | Mode | index into `MODES` |
| 3 | Key | index into `KEYS`, 0 to 14 |
| 4 | Fine tune | cents + 64 |
| 5 | First string | index into `SWARAS` |
| 6-7 | A4 | tenths of a Hz, big-endian |
| 8-9 | The round | hundredths of a second, big-endian |
| 10-12 | Tone, pluck, sustain | 0 to 100 each |

Volume isn't stored, and decoding takes it from the settings the caller
passes in. Every value is clamped to the app's ranges on the way in
(`normalizeThambura`), so an out-of-range number plays the nearest valid
value, and an index past the end of its table falls back to a valid entry,
rather than failing.

The orders these indexes point into:

| Table | Order |
| --- | --- |
| `MODES` | `jawari`, `tambura`, `guitar`, `custom`, `sruti` |
| `VIEWS` | `mini`, `studio`, `raagini`, `lab` |
| `SWARAS` | `Sa`, `Ri1`, `Ri2`, `Ri3`, `Ga3`, `Ma1`, `Ma2`, `Pa`, `Da1`, `Da2`, `Da3`, `Ni3` |
| `KEYS` | A2, A#2, B2, C3, C#3, D3, D#3, E3, F3, F#3, G3, G#3, A3, A#3, B3 |
| `BASES` | `jawari`, `tambura`, `guitar` |

## A Custom plan

After byte 12, a Custom link has:

| Byte | Holds |
| --- | --- |
| 13 | The built-in plan it's stored against (index into `BASES`), plus `0x80` for the whole layout |
| 14-15 | That plan's checksum, big-endian |
| 16 on | The plan, as edits or whole, then the hidden values |

The encoder tries all six choices (three built-in plans, two layouts) and
keeps the shortest, so a link is never longer than the whole layout.

### How values are stored

Plan values are stored in the Lab's own units, as a count of the field's
slider steps above its minimum. Ring at 50 s, with a minimum of 0.5 s and a
step of 0.5 s, is step 99. Anything set in the Lab lands on a step and costs
a byte or two. A value that isn't on a step (a built-in sound's own value,
or one the Lab copied between strings) is stored exactly, as a big-endian
IEEE 754 double.

Steps and counts are varints: seven bits a byte, low bits first, with the top
bit set on every byte but the last. So 0 to 127 is one byte, and 225 is
`e1 01`.

A string mask is one byte whose bits 0 to 3 are strings 1 to 4.

### Edits

A varint count, then each edit:

- **A plan field:** a byte with the field's index in `FIELDS`, plus `0x40`
  when the value is exact; a string mask; then the value, a varint step or a
  double. Strings that share a new value share one edit.
- **`254`, the attack scaling:** a string mask of the strings whose render is
  scaled by its attack (`attackLevel`).
- **`255`, the gaps:** the four gaps between plucks as big-endian u16s, in
  ten-thousandths of the round, with no mask.

Anything not edited stays as the built-in plan has it.

### Whole

For each of the four strings, and each field in `FIELDS` order, a varint that
is `0` for "as the built-in plan", `1` followed by a double for an exact
value, or the step plus 2. Then the attack-scaling mask, and the four gaps as
in the edits layout.

### Hidden values

Both layouts end with the voice values the Lab doesn't show (`HIDDEN`:
`seconds`, `tailFade`, `maxPartialHz`, `attackLevel`), wherever they differ
from what the layout above rebuilds: a varint count, then each one's index
in `HIDDEN`, a string mask and a double.

### The checksum

The checksum is FNV-1a over the built-in plan's slider steps (every string,
every field in `FIELDS` order), then its attack-scaling mask, then its gaps,
folded to 16 bits. A decoder rebuilds the built-in plan, and if its checksum
isn't the one in the link, it sets `drifted` and the app shows the "older
version" note. It doesn't cover the hidden values
([#121](https://github.com/panyam/thambura/issues/121)).

Gaps are rescaled to add up to one on the way in, each at least one
ten-thousandth.

### FIELDS

| Index | Field | In the Lab | Range | Step |
| --- | --- | --- | --- | --- |
| 0 | `level` | Level | -30 to 6 dB | 0.5 |
| 1 | `bite` | Force | 0 to 3 | 0.05 |
| 2 | `attack` | Attack | 1 to 80 ms | 1 |
| 3 | `pluckAt` | Pluck point | 2 to 50 % | 0.5 |
| 4 | `ringSeconds` | Ring | 0.5 to 60 s | 0.5 |
| 5 | `damping` | High decay | 0 to 0.3 | 0.002 |
| 6 | `damp` | Stop before next | 0 to 40 % | 0.5 |
| 7 | `rolloff` | Rolloff | 0.3 to 3 | 0.05 |
| 8 | `maxPartials` | Harmonics | 1 to 64 | 1 |
| 9 | `formantDb` | Bloom | 0 to 60 dB | 0.5 |
| 10 | `formantHz` | Bloom centre | 200 to 5000 Hz | 10 |
| 11 | `formantOctaves` | Bloom width | 0.2 to 3 oct | 0.05 |
| 12 | `formantRise` | Bloom rise | 0.02 to 3 s | 0.01 |
| 13 | `formantHold` | Bloom hold | 0 to 4 s | 0.05 |
| 14 | `formantFall` | Bloom fall | 0.1 to 3 s | 0.05 |
| 15 | `formantRest` | Bloom rest | 0 to 1 | 0.01 |
| 16 | `formantEnergy` | Bloom energy | 0 to 1 | 0.01 |
| 17 | `sweepFrom` | Sweep from | 1 to 60 | 0.5 |
| 18 | `sweepTo` | Sweep to | 1 to 30 | 0.5 |
| 19 | `sweepSeconds` | Sweep time | 0.1 to 20 s | 0.1 |
| 20 | `sweepWidth` | Sweep width | 0.5 to 10 | 0.1 |
| 21 | `bloom` | Sweep gain | 0 to 5 | 0.05 |
| 22 | `shimmer` | Shimmer | 0 to 5 | 0.1 |
| 23 | `swell` | Swell | 0 to 1 | 0.01 |
| 24 | `detune` | Detune | -20 to 20 ¢ | 0.1 |
| 25 | `pan` | Pan | -1 to 1 | 0.05 |

The ranges and steps come from `FIELD_SPECS` in `thamburaPlan.ts`, and a
step's meaning depends on them. Changing a field's minimum or step changes
what every stored step of it decodes to, so those count as format changes
too.

## A worked example

The built-in Shimmer preset is 86 characters and 64 bytes:

```
ARwDBEAHETABLDIyPADY5g8BDwcCDxEED2MFDwMGDwAHDxQJB1wJCDQKD2QLDxYMDzUNDzQODxgPDzcYBOEBAA

01 1c 03 04 40 07 11 30 01 2c 32 32 3c 00 d8 e6 0f 01 0f 07 02 0f 11 04 0f 63 05 0f
03 06 0f 00 07 0f 14 09 07 5c 09 08 34 0a 0f 64 0b 0f 16 0c 0f 35 0d 0f 34 0e 0f 18
0f 0f 37 18 04 e1 01 00
```

| Bytes | Reads as |
| --- | --- |
| `01` | format 1 |
| `1c` | flags `00011100`: just, gents, bar open, view 3 (Lab) |
| `03` | mode 3, Custom |
| `04` | key 4, C#3 |
| `40` | fine tune 0 (64 − 64) |
| `07` | first string 7, Pa |
| `11 30` | A4 4400 tenths, 440 Hz |
| `01 2c` | the round, 300 hundredths, 3 s |
| `32 32 3c` | tone 50, pluck 50, sustain 60 |
| `00` | stored against `jawari`, as edits |
| `d8 e6` | the jawari plan's checksum |
| `0f` | 15 edits |
| `01 0f 07` | Force, all four strings, step 7 (0.35) |
| `02 0f 11` | Attack, all four, step 17 (18 ms) |
| `04 0f 63` | Ring, all four, step 99 (50 s) |
| `05 0f 03` | High decay, all four, step 3 (0.006) |
| `06 0f 00` | Stop before next, all four, step 0 (let it ring) |
| `07 0f 14` | Rolloff, all four, step 20 (1.3) |
| `09 07 5c` | Bloom, strings 1-3, step 92 (46 dB) |
| `09 08 34` | Bloom, string 4 (the low Sa), step 52 (26 dB) |
| `0a 0f 64` | Bloom centre, all four, step 100 (1200 Hz) |
| `0b 0f 16` | Bloom width, all four, step 22 (1.3 oct) |
| `0c 0f 35` | Bloom rise, all four, step 53 (0.55 s) |
| `0d 0f 34` | Bloom hold, all four, step 52 (2.6 s) |
| `0e 0f 18` | Bloom fall, all four, step 24 (1.3 s) |
| `0f 0f 37` | Bloom rest, all four, step 55 (0.55) |
| `18 04 e1 01` | Detune, string 3, step 225 (+2.5 ¢) |
| `00` | no hidden values |

The levels, pans and gaps aren't edited, so they're the jawari plan's.

## Page links (format 2)

A page can hold more than one instrument, so its link is made of parts, one
per instrument, keyed by the instrument's id on the page (`thambura-1`,
`thambura-2`). After the format byte `2`, each part is:

| Bytes | Holds |
| --- | --- |
| 1 | The kind, as an index into `PAGE_KINDS` plus one |
| 1 | The instrument's number on the page: `thambura-2` is 2 |
| varint | The payload's length |
| that many | The payload |

`PAGE_KINDS` is `thambura`, `session`, `hands`, then `kit`. A thambura's payload is a whole
format 1 link, the same bytes as above, so its bar flag and drift checksum
work as they always have.

### The session part

`session-1` is what the whole page shares rather than one instrument
([#101](https://github.com/panyam/thambura/issues/101)). Its payload is
eleven bytes:

| Byte | Holds |
| --- | --- |
| 0 | Its own format, `1` |
| 1 | The tala, as an index into `TALAS` |
| 2, 3 | Jaathi and nadai, as indexes into `GATIS` |
| 4 | Kalai |
| 5-6 | The tempo in bpm |
| 7 | The key, 0 (A2) to 14 (B3) |
| 8 | The fine tune in cents, plus 64 |
| 9-10 | A4 in tenths of a Hz |

The thambura's part still carries its own key, fine tune and A4, since a
format 1 link must. When a page link has both, the session's shruthi is the
one played. A page link without a session part, and a format 1 link, take
the shruthi from `thambura-1`'s part, as they always did.

A reader skips a part of a kind it doesn't know, and a thambura part that
isn't a readable thambura link, and keeps the rest of the page, so a link
from a newer version still opens the instruments this one has. A link that
runs out partway through a part is rejected as a whole, like a short format
1 link.

### The kriyas and kit parts

The kriyas (`hands-1`) and each kit (`kit-1`, `kit-2`) have a part too
([#101](https://github.com/panyam/thambura/issues/101)), so a link carries
every instrument on the page. On a page with a track list, the parts a link
has are the instruments it opens with.

| Part | Bytes |
| --- | --- |
| hands | its own format `1`; the volume; the sound group's name as a length byte and that many bytes of UTF-8 |
| kit | its own format `1`; which of the page's kits it is (their order in the page spec); Variety as an index into `VARIETIES`; the volume; `1` if it plays along with the tala, else `0` |

The sound group is written by name because the groups come from the
fixture file, not from a table in the code. A kit is written by position
because the kits are whatever the server found at startup, so a link from a
server with a different set of kits can open a different one.

A page whose only part is `thambura-1` is written as that part alone, in
format 1. Every page now writes a session part too, so nothing writes one
alone any more, but format 1 links keep opening. A format 1 link read as a
page is `thambura-1`'s part.

## Changing the format

People keep links, and presets are links, so a link made today has to open
the same sound after any later release. The rules:

- **Add to the ends of the tables, never reorder them.** `MODES`, `VIEWS`,
  `SWARAS`, `BASES`, `FIELDS`, `HIDDEN`, `PAGE_KINDS`, `TALAS`, `GATIS` and `VARIETIES` are all part of the format, since
  a link stores positions in them. A new mode, view or field goes at the
  end, and old links never mention it.
- **Leave the ranges and steps of existing fields alone,** for the reason
  above.
- **Anything else bumps `FORMAT`.** A new byte in the settings, a new layout,
  a wider mask: write it as a new format, and keep reading format 1 exactly
  as it reads now. A version of the app that doesn't know the new format
  plays the listener's own setup and says it can't read the link, which is
  the right failure.

`shareLink.test.ts` holds links made by format 1, written down as they were
sent, with what they decode to ("format 1 links keep opening the same"). If
a change breaks one, the change broke the format. Shimmer, above, is one of
them.

Page links came in with instance ids
([#100](https://github.com/panyam/thambura/issues/100)). A new kind of
instrument in a link is a new entry at the end of `PAGE_KINDS` and needs no
new format: older versions skip its parts.
