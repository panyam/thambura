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
  `k p` in another (review 3). So solkattu can't be a relabelling of
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

## How a phrase becomes strokes

There is no big phrase dictionary. There is a small default table per
instrument (fourteen entries for the mridangam, below), and a pattern can
override any entry for itself. A phrase with no entry is a build error, not a
guess. Longer entries win over shorter ones. The per-pattern override is the
important part: the right strokes for *ta ka* depend on the piece, so the
choice is recorded where the piece is.

## For review 1: the stroke names

Strokes are written one letter each. Here is each letter against what our kit
has and what the lane calls it now. The dataset column is the CompMusic label
the take came from.

| Letter | Name | Head | Our kit | Lane shows | Dataset | Take? |
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
| | | right | `R.tha` | Tha | tha | yes, but no letter for it |

Things to decide:

1. **The names the lane uses for strokes.** Ours came from the dataset's
   labels, and two of them mislead. "Thi" is the stroke usually called *ki*,
   and "Dheem" names two different strokes (`R.dheem`, *dim*, and `L.dheem`,
   thom with din). The names in the second column would be: ki, ta, nam, din,
   dim, chapu, thom, tham (thom+nam), and dheem or "thom din" for `od`. Which
   spelling: *din* or *dhin*, *dim* or *dheem*, *tham* or *thom-nam*?
2. **What `R.tha` is.** The dataset's *tha* measured as a closed right-head
   stroke, and no letter above is a right-hand tha. It may be *ta* played
   differently, or another school's name. A player would know by ear; until
   then it stays out of the phrase table.
3. **The left-hand tha (`p`) is the big gap.** Half the default table uses it
   (`k p`, `k p n p`, `p k t k`…), and the kit has no take. Options: leave it
   silent (the phrase keeps its time, loses a stroke), play `R.thi` softly
   (wrong head, wrong sound), or record it (#80). This decides how much of
   the table plays at all before a recording session.

## For review 2: the syllables

Each syllable gets an id, one spelling the app shows, and aliases the
editor and the pattern files also accept. The phrase table, saved patterns
and share links hold the id, never the spelling (see "Watch out for").

A spelling merges into another only when a teacher would say the same sound
**and** nothing realizes the two differently. Romanization alone isn't enough:
Tamil writes *t*, *th* and *dh* with one letter, so spelling differences are
mostly noise, but *thom* and *dhom* are realized differently in the counts
below (review 3), so they stay apart until a player says otherwise.

| Id | Shown as | Aliases | Status |
|---|---|---|---|
| `cha` | cha | | |
| `cham` | cham | | |
| `di` | di | dhi | merge |
| `din` | din | dhin | merge |
| `dim` | dim | dhim, dheem | merge |
| `dit` | dit | dhit | merge |
| `dhom` | dhom | dom | merge |
| `thom` | thom | | **hold**: not merged with dhom (thom → `od` 4 of 5, dhom → `o` 5 of 5) |
| `du` | du | dhu | merge |
| `ga` | ga | | |
| `gin` | gin | | keep apart from ki |
| `gu` | gu | | |
| `jo` | jo | ja | merge (*ta ka jo nu* = *ta ka ja nu*) |
| `ka` | ka | | |
| `ki` | ki | | |
| `ku` | ku | | |
| `kum` | kum | | |
| `lang` | lang | | |
| `mi` | mi | | |
| `na` | na | | keep apart from nam and nang |
| `nam` | nam | | |
| `nang` | nang | | |
| `nu` | nu | | |
| `ri` | ri | | |
| `ta` | ta | ṭa | merge (the retroflex *ṭa* shown as ta) |
| `tha` | tha | | **hold**: some teachers keep it apart from ta |
| `tat` | tat | | keep: nearly always `k` (23 of 25) |
| `tam` | tam | | **hold**: tam splits `u` / `od`, tang is `u`; whether *tham* is an alias waits on this |
| `tang` | tang | | |
| `ti` | ti | | |
| `tong` | tong | | |

Which spelling is shown is the other half of this review: *din* or *dhin*,
*jo* or *ja*, *dim* or *dheem*. The ids can stay as they are whatever is
shown.

## For review 3: the phrase table

### The defaults

Fourteen entries, with what this kit would play. "—" is a stroke the kit has
no take for.

| Solkattu | Strokes | Here |
|---|---|---|
| thom | `o` | thom |
| dhom | `o` | thom |
| tang | `u` | — (arai chapu) |
| lang | `u` | — |
| cham | `u` | — |
| ta lang | `p u` | — — |
| ta ka din na | `k o o k` | ki thom thom ki |
| ta din gin na thom | `k t k n o` | ki ta ki nam thom |
| ta ka | `k p` | ki — |
| ta ka ti ku | `k p n p` | ki — nam — |
| ta ri ki ta | `o k n p` (fast: `p k t p`) | thom ki nam — |
| ta ka ti ku ta ri ki ta | `k t k t o k n p` | ki ta ki ta thom ki nam — |
| ta ka ta ri ki ta ta ka | `n p u p k t p k` | nam — — — ki ta — ki |
| ta ka du gu ta ri ki ta | `t k o o k t p k` | ta ki thom thom ki ta — ki |

Eight of the fourteen need a stroke we lack. With `p` recorded, all but the
arai chapu ones play.

### What compositions override

How often transcribed compositions override a phrase, and the realizations
they choose, most common first. This is what a default table can't capture,
and it's the case for per-pattern overrides.

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

Read as a starting table, the counts suggest adding single-syllable defaults
that the table above leaves to each piece: *din* → `od`, *tat* → `k`, *ta* →
`k`, *dit* → `t`, *ta din* → `k od`, *tat dit* → `k t`. *tam*, *dim*, *ta ka*
and *ta ki ta* split too evenly to default; a pattern using them names its
choice.

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

Which misram order?

## Watch out for

- **Store ids, never spellings.** Saved patterns, share links and the phrase
  table hold syllable ids and stroke ids (`R.thi`). Renaming "Thi" to "Ki",
  choosing *jo* over *ja*, or showing Tamil or Kannada script later is then a
  change to a display table that breaks nothing anyone saved. The stroke
  renames from review 1 change `label` in `kit.json` and keep the `id`.
- **Counting syllables are not solkattu to realize.** *ta ka di mi* in the
  counting line uses the same words as a composition. If the counting line
  ever reached the phrase table, the app would play the count as strokes. They
  are separate data, and the realizer never sees the counting line.
- **Syllables and strokes share names.** *ta*, *nam*, *din*, *thom* and
  *dheem* are both. With solkattu large and strokes small in the lane, "ta"
  over "ta" reads as a duplicate and "ta" over "ki" as a mistake. The stroke
  line looks different: the stroke letters, or a head marker (L, R).
- **Words written together.** Teachers write *takadimi* and *tadinginathom*
  as one word, sometimes dropping an *n* (*tadinginathom* for
  *tadinginnathom*). Every alias makes splitting more ambiguous, so the parser
  rejects an ambiguous split instead of picking one, and the editor takes
  syllables separated by spaces.
- **Speed and gathi change the realization.** *ta ri ki ta* is `o k n p` at
  one speed and `p k t p` fast. A table entry takes an optional speed, or the
  fast version is its own entry; otherwise first and second speed play the
  same strokes.
- **Syllables with length.** *din _ ga* and a held *tam* take more than one
  slot. The table carries the gaps, and the lane shows a held syllable across
  its slots rather than as a cell followed by blanks.
- **One school's answer isn't the answer.** Banis differ. The defaults stay
  modest, a school's choice lives in a pattern's overrides, and a merge in
  review 2 shouldn't quietly settle a question between schools.

## The format

A pattern gains a `sol:` role beside `mrid:`, aligned atom for atom, which
the notations DSL already allows. Either line can be the source:

```
---
id: adi-korvai-1
role: korvai
source: transcribed, unverified
realize:
  ta ka: p k        # this piece's choice
---
\cycle("|4|2|2|")
\beatDuration(4)
sol:  ta din gin na thom , ta ka ...
```

The compiler realizes `sol:` into strokes at build time, as it compiles
patterns today:

1. The pattern's own `realize:` entries, longest match first.
2. The instrument's phrase table (the defaults plus the additions review 3
   agrees), longest match first.
3. Otherwise a build error naming the phrase. Never a guess.

A pattern written as `mrid:` only (today's) keeps working and shows strokes
with no syllables. A pattern with both lines checks they have the same shape
and uses the strokes as written: that is how a player's transcription, which
records what was played, keeps its solkattu for the lane. A stroke the kit
lacks is replaced by the kit's declared stand-in for it or a rest, and the
compiled pattern records that it did, so the lane can mark it.

The phrase table lives in `web/patterns/`, one file per instrument kind
(`realize/mridangam.json`), next to today's `strokes.json`, which becomes the
stroke letter table above.

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
3. **`sol:` and the phrase table** in the pattern compiler, with the defaults
   and the agreed additions; today's patterns get a solkattu line where one
   is known.
4. **The lane shows solkattu** over strokes (#82).
5. Then the editor, korvais every N cycles and the generator, each on this.

## Open questions

1. **Who checks it.** The realizations and the stand-ins for missing strokes
   are unverified, as the patterns' `source` lines already say.
2. **The left-hand tha.** Silent, a stand-in, or wait for a recording
   (review 1, point 3)?
