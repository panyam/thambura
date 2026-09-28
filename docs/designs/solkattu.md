# Solkattu over the strokes

A design for review, 2026-09-28. Nothing here is built. It proposes what the
mridangam's patterns are written in, what the lane shows, and where the
syllables come from, so that the editor, korvais on demand and other
instruments all sit on one vocabulary. The review wanted first is of the
names and the phrase table (the four "For review" sections); the format and
the build order follow from whatever those settle.

## Why

The lane shows stroke names today: chapu, dhin, nam, dheem, thi, ta, tha,
thom, tham. That is what the hand does, and it isn't what anyone says. A
student learns *ta ka di mi ta ka jo nu*, and a korvai is taught as solkattu
and realized on the drum afterwards. Two things follow from that.

- **Solkattu and strokes aren't one to one.** The same *ta* is a ki in one
  phrase and a tha in the next, and *ta ka* is `p k` in one composition and
  `k p` in another (the tallies below). So solkattu can't be a relabelling of
  the lane; it needs a realization step.
- **Solkattu belongs to no instrument.** Written once, a korvai can be played
  by a mridangam kit, a ghatam kit or a kanjira kit, or spoken. That is #99's
  "patterns name their instrument" solved from the other end: the pattern
  names no instrument, and each instrument brings its realization.

## Three vocabularies, kept apart

| | What it is | Example | Who uses it |
|---|---|---|---|
| **Stroke names** | What a hand does on which head | thi, nam, thom, arai chapu | the kit, the pad, the realization |
| **Counting syllables** | One per slot, set by the nadai, the same for every piece | *ta ka di mi* | a student counting, the lane with no pattern, a count-in |
| **Composition solkattu** | What a teacher recites for a particular piece | *ta din gin na thom* | patterns, korvais, the editor |

Today we only have the first. The counting syllables are the cheapest win:
they need no realization and no player, and the lane can show them under
any pattern (or with none) from the nadai alone.

## Where karya's version is

[karya](https://github.com/elaforge/karya) is Evan Laforge's music system;
its `Solkattu/` directory is a solkattu notation and realizer, with 469
korvais and sarvalaghus transcribed from his teachers (Ganesh, and others
named per score). GPL-3.0. We already use three of its sarvalaghus with his
permission (`web/patterns/CREDITS.md`). Links are pinned to the commit read
for this doc, 26647cb (2026-09-03):

| What | Where |
|---|---|
| The 34 sollus (the spoken syllables) | [`Solkattu/Solkattu.hs`, `data Sollu`](https://github.com/elaforge/karya/blob/26647cb32d2512a6914cfab22ef639d7eeed1f50/Solkattu/Solkattu.hs#L358-L364) |
| Named fragments (`tdgnt`, `takadinna`, `tarikita`…) | [`Solkattu/Dsl/Solkattu.hs`](https://github.com/elaforge/karya/blob/26647cb32d2512a6914cfab22ef639d7eeed1f50/Solkattu/Dsl/Solkattu.hs#L66-L176) |
| **The default phrase table** (`_mridangamStrokes`) | [`Solkattu/Dsl/Solkattu.hs`](https://github.com/elaforge/karya/blob/26647cb32d2512a6914cfab22ef639d7eeed1f50/Solkattu/Dsl/Solkattu.hs#L284-L302) |
| The strokes and their letters | [`Solkattu/Instrument/Mridangam.hs`](https://github.com/elaforge/karya/blob/26647cb32d2512a6914cfab22ef639d7eeed1f50/Solkattu/Instrument/Mridangam.hs#L48-L90), letters at [L168-L194](https://github.com/elaforge/karya/blob/26647cb32d2512a6914cfab22ef639d7eeed1f50/Solkattu/Instrument/Mridangam.hs#L168-L194), the `Strokes` record at [L322-L360](https://github.com/elaforge/karya/blob/26647cb32d2512a6914cfab22ef639d7eeed1f50/Solkattu/Instrument/Mridangam.hs#L322-L360) |
| Default patterns for 5 to 9 matras (`k t k n o` and its spreads) | [`Mridangam.hs`, `defaultPatterns`](https://github.com/elaforge/karya/blob/26647cb32d2512a6914cfab22ef639d7eeed1f50/Solkattu/Instrument/Mridangam.hs#L467-L474) |
| A composition's own table, for example | [`Solkattu/Score/Solkattu2014.hs`](https://github.com/elaforge/karya/blob/26647cb32d2512a6914cfab22ef639d7eeed1f50/Solkattu/Score/Solkattu2014.hs#L36-L42) |
| The scores themselves | [`Solkattu/Score/`](https://github.com/elaforge/karya/tree/26647cb32d2512a6914cfab22ef639d7eeed1f50/Solkattu/Score): `Solkattu20xx.hs` are korvais written in solkattu, `Mridangam20xx.hs` directly in strokes, `MridangamSarva.hs` the sarvalaghus |

**How karya realizes.** There is no big phrase dictionary. There is a small
default table (fourteen entries, below), and every composition adds its own
`makeMridangam [...]` list that overrides it for that piece. A sollu with no
entry is an error, not a guess. Longer entries win over shorter ones. That
per-piece override is the design lesson: the "right" strokes for *ta ka*
depend on the piece, and karya records the choice where the piece is.

## For review 1: the stroke names

Karya writes a stroke per letter. Here is each one against what our kit has
and what the lane calls it now. The dataset column is the CompMusic label the
take came from.

| karya | karya's name | Head | Our kit | Lane shows | Dataset | Take? |
|---|---|---|---|---|---|---|
| `k` | ki | right | `R.thi` | Thi | thi | yes |
| `t` | ta | right | `R.ta` | Ta | ta | yes |
| `n` | nam | right | `R.nam` | Nam | num | yes |
| `d` | din | right | `R.dhin` | Dhin | dhin | yes |
| `i` | dim | right | `R.dheem` | Dheem | bheem | yes |
| `v` | muru chapu (full chapu) | right | `R.chapu` | Chapu | cha | yes |
| `u` | arai chapu (half chapu) | right | none | | none | **no** (#80) |
| `l` | mi, a light ki (middle finger) | right | `R.thi`, softer | Thi | | approximated |
| `y` | kin, ki on the meetu | right | `R.thi` | Thi | | approximated |
| `j` | tan, ta on the meetu | right | none | | | no |
| `p` | tha, the left palm | left | none | | none | **no** (#80) |
| `o` | thom | left | `L.thom` | Thom | thom | yes |
| `o/` | gumki (thom, then up) | left | `L.gumki`, a bent thom | Gumki | | derived |
| `od` / `D` | thom with din | both | `L.dheem` | Dheem | dheem | close, not the same hand shape |
| `on` / `N` | thom with nam | both | `L.tham` | Tham | tham | yes |
| | | right | `R.tha` | Tha | tha | yes, but karya has no such stroke |

Things to decide:

1. **The names the lane uses for strokes.** Ours came from the dataset's
   labels, and two of them mislead. "Thi" is karya's *ki*, and "Dheem" names
   two different strokes (`R.dheem`, karya's *dim*, and `L.dheem`, karya's
   thom-with-din). Karya's names would be: ki, ta, nam, din, dim, chapu,
   thom, tham (thom+nam), dheem or "thom din" for `od`. Which spelling
   convention: *din* or *dhin*, *dim* or *dheem*, *tham* or *thom-nam*?
2. **What `R.tha` is.** The dataset's *tha* measured as a closed right-head
   stroke, and karya has no right-hand tha. It may be what karya calls *ta*
   played differently, or a stroke from another school's vocabulary. A player
   would know by ear; until then it stays out of the phrase table.
3. **The left-hand tha (`p`) is the big gap.** Karya's default table uses it
   in half its entries (`k p`, `k p n p`, `p k t k`…), and the kit has no
   take. Options: leave it silent (the phrase keeps its time, loses a
   stroke), play `R.thi` softly (wrong head, wrong sound), or record it
   (#80). This decides how much of karya plays at all before a recording
   session.

## For review 2: the sollus

Karya's 34 syllables, as it spells them. The lane would show these; the
question is the spelling, and whether we transliterate one way everywhere
(karya's is phonetic ASCII, Tamil and Kannada teachers write differently).

`cha cham dhom dom di din dim dit du ga gin gu jo ka ki ku kum lang mi na nam
nang nu ri ta ṭa tam tang tat tha thom ti tong`

Notes on it:

- It says *jo nu*, not *ja nu*. Both are heard (*ta ka jo nu*, *ta ka ja
  nu*); pick one for the counting line.
- It says *di mi*, not *dhi mi*. Karya doesn't distinguish aspirated *dh*
  from *d* in sollus.
- *ṭa* (retroflex) exists alongside *ta*.

## For review 3: the phrase table

### Karya's defaults, converted

The fourteen entries of `_mridangamStrokes`, with what this kit would play.
"—" is a stroke the kit has no take for.

| Solkattu | karya's realization | Here |
|---|---|---|
| thom | `o` | thom |
| dhom | `o` | thom |
| tang | `u` | — (arai chapu) |
| lang | `u` | — |
| cham | `u` | — |
| ta lang | `p u` | — — |
| ta ka din na | `k o o k` | ki thom thom ki |
| ta din gin na thom | `k t k n o` | ki ta ki nam thom |
| ta ka (standard) | `k p` | ki — |
| ta ka ti ku (standard) | `k p n p` | ki — nam — |
| ta ri ki ta (standard) | `o k n p` (fast: `p k t p`) | thom ki nam — |
| ta ka ti ku ta ri ki ta (standard) | `k t k t o k n p` | ki ta ki ta thom ki nam — |
| ta ka ta ri ki ta ta ka (*nakatiku*) | `n p u p k t p k` | nam — — — ki ta — ki |
| ta ka du gu ta ri ki ta | `t k o o k t p k` | ta ki thom thom ki ta — ki |

Eight of the fourteen need a stroke we lack. With `p` recorded, all but the
arai chapu ones play.

### What karya's compositions actually choose

Every `makeMridangam` override across the scores, tallied by phrase: how
often it was overridden, and the realizations it got most. This is what the
default table can't capture, and it's the case for per-pattern overrides.

| Solkattu | Times | Realizations, most common first |
|---|---|---|
| din | 52 | `od` ×48, `o` ×3, `d` ×1 |
| tam | 27 | `u` ×15, `od` ×9, `v` ×2, `n` ×1 |
| ta ka | 25 | `p k` ×11, `k p` ×8, `k t` ×2, `o k` ×2 |
| tat | 25 | `k` ×23, `on` ×2 |
| dim | 19 | `od` ×13, `i` ×4, `u` ×2 |
| ta | 19 | `k` ×19 |
| ta ki ta | 14 | `k p k` ×4, `n p k` ×3, `p k od` ×2, `o o k` ×2 |
| ki ta ta ka | 11 | `k t p k` ×5, `p k n p` ×2, `k t k t`, `k t k o` |
| tat dit | 10 | `k t` ×9, `on u` ×1 |
| ta din | 8 | `k od` ×8 |
| dit | 8 | `t` ×4, `k` ×3, `n` ×1 |
| na | 7 | `on` ×4, `n` ×2, `k` ×1 |
| din gu | 7 | `od o` ×4, `od k` ×2 |
| din _ ga | 6 | `od _ p` ×2, `od _ k` ×2, `od _ _` ×2 |
| ta ri ki ta | 5 | `p k t p` ×2, `o k n p`, `p k n p`, `p k t k` |
| dhom | 5 | `o` ×5 |
| din tat | 5 | `o k` ×5 |
| thom | 5 | `od` ×4, `o` ×1 |
| ta ka din | 5 | `k o od` ×3, `k o o` ×2 |
| tang ga | 5 | `u _` ×2, `on k` ×2, `u p` |
| ta ka din na | 4 | `k o od k`, `k o on k`, `k od od k`, `n o o k` |
| ta lang ga | 3 | `p u k` ×3 |
| gu gu na na | 3 | `o o n n` ×3 |
| ta din na | 3 | `on on k` ×3 |

Read as a starting table, the tallies suggest adding to karya's defaults the
single-sollu entries it leaves to each piece: *din* → `od`, *tat* → `k`,
*ta* → `k`, *dit* → `t`, *ta din* → `k od`, *tat dit* → `k t`. *tam*,
*dim*, *ta ka* and *ta ki ta* split too evenly to default; a pattern using
them names its choice.

This tally is a script over karya's source, not something Evan wrote:
`karya/phrase_tally.py` in thambura-ext (private), which reruns it against
a newer karya.

## For review 4: the counting syllables

One per slot, by nadai. These are the common ones; the spelling follows
whatever review 2 settles.

| Nadai | Slots | Syllables |
|---|---|---|
| Tisram | 3 | ta ki ta |
| Chatusram | 4 | ta ka di mi |
| Chatusram, 2nd speed | 8 | ta ka di mi ta ka jo nu |
| Khandam | 5 | ta ka ta ki ta |
| Misram | 7 | ta ki ta ta ka di mi (some teach ta ka di mi ta ki ta) |
| Sankeernam | 9 | ta ka di mi ta ka ta ki ta |

Karya doesn't carry these as a set (it has *di*, *mi*, *jo*, *nu* as sollus,
and `defaultPatterns` gives the drum's version, `k t k n o` spread over 5 to
9), so this table is ours. Which misram order?

## The format

A pattern gains a `sol:` role beside `mrid:`, aligned atom for atom, which
the notations DSL already allows. Either line can be the source:

```
---
id: adi-korvai-1
role: korvai
source: karya Solkattu2014.hs c_14_01_14, learned from Ganesh
realize:
  ta ka: p k        # this piece's choice, as karya's makeMridangam
---
\cycle("|4|2|2|")
\beatDuration(4)
sol:  ta din gin na thom , ta ka ...
```

The compiler realizes `sol:` into strokes at build time, as it compiles
patterns today:

1. The pattern's own `realize:` entries, longest match first.
2. The instrument's phrase table (karya's defaults plus the additions review
   3 agrees), longest match first.
3. Otherwise a build error naming the phrase, as karya does. Never a guess.

A pattern written as `mrid:` only (today's) keeps working and shows strokes
with no syllables. A pattern with both lines checks they have the same shape
and uses the strokes as written: that is how a player's transcription, which
records what was played, keeps its solkattu for the lane. A stroke the kit
lacks is replaced by the kit's declared stand-in for it or a rest, and the
compiled pattern records that it did, so the lane can mark it.

The phrase table lives in `web/patterns/`, one file per instrument kind
(`realize/mridangam.json`), next to today's `strokes.json`, which becomes the
stroke letter table: karya's letters, so its scores can be pasted in.

## What it unlocks

- **The lane (#82)** shows solkattu large and the stroke small, or counting
  syllables when the pattern has no `sol:` line.
- **The editor** edits in solkattu, shows the realization under it, and lets
  a slot's stroke be overridden, which writes a `realize:` entry.
- **A korvai generator** works in solkattu phrases (the arithmetic of a
  phrase three times plus gaps landing on sam or the eduppu) and never needs
  to know about strokes.
- **Other instruments (#99, #104)** bring a phrase table, not patterns.
- **Spoken solkattu**, the syllables said along with the drum, needs only the
  `sol:` line and recordings of the syllables.

## Build order

1. **Settle the names** (reviews 1, 2 and 4). A small PR renames the kit's
   labels if we change them.
2. **Counting syllables in the lane**, from the nadai, no patterns involved.
3. **`sol:` and the phrase table** in the pattern compiler, with karya's
   defaults and the agreed additions; the three karya sarvalaghus get their
   solkattu where the source has it.
4. **The lane shows solkattu** over strokes (#82).
5. Then the editor, korvais every N cycles and the generator, each on this.

## Open questions

1. **Permission.** Evan's permission covers the three patterns. The phrase
   table and the stroke letters are more of karya; ask him to cover those,
   and credit him on `/about` along with the kit.
2. **Who checks it.** The realizations are his teachers'; our conversion and
   the stand-ins for missing strokes are ours and unverified, as the
   patterns' `source` lines already say.
3. **The left-hand tha.** Silent, a stand-in, or wait for a recording
   (review 1, point 3)?
