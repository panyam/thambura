# The ghatam and the tabla: strokes, syllables and taals

A design for review, 2026-09-28. Nothing here is built. It extends
`solkattu.md` to two more instruments: the ghatam, which shares solkattu with
the mridangam, and the tabla, which has its own syllables (bols) and its own
rhythmic cycles (taals). It proposes stroke ids and labels for a `kit.json`
for each, how the mridangam's phrase table carries over to the ghatam, a bol
table in the shape of solkattu.md's syllable table, and what the tala grid
needs before it can hold a Hindustani taal.

Most of the stroke technique below comes from web sources of mixed quality,
and each claim cites its source. The ghatam sources are especially thin.
Wherever a claim is ours rather than a source's, the text says so. The
questions only a player can answer are gathered at the end.

## Why

The kit format was written so that a new drum is data, not code
(`instruments.md`, #104). That holds for the sounds. It doesn't yet hold for
what a pattern is written in. `solkattu.md` says a korvai written in solkattu
can be played by any Carnatic instrument that brings its own phrase table.
The ghatam is the first test of that claim. The tabla tests the opposite
case: a drum whose syllables aren't solkattu, whose cycles aren't sapta
talas, and whose basic pattern (the theka) is also how a taal is recited.

- **The ghatam should need a phrase table and a kit, nothing else.** If it
  needs more than that, the solkattu design is wrong somewhere, and it is
  cheaper to find out now.
- **The tabla has a different vocabulary, and the two must stay separate.**
  *ta*, *na*, *dhin* and *ki* are words in both solkattu and tabla bols, and
  they mean different things. A bol id and a solkattu id that share a
  spelling are still different ids.

## Three things carried over from solkattu.md

The rules there apply here unchanged:

- Stroke names, counting syllables and composition syllables are separate
  vocabularies.
- Ids are stored and spellings are shown. Nothing saved holds a spelling.
- A phrase with no realization is a build error, not a guess.

What changes is that the syllables now come in two languages, and the tabla's
counting line and its patterns overlap.

## Ghatam

### What a ghatam is, for the kit

A ghatam is a clay pot held in the lap with its mouth against the player's
stomach. It is struck with the fingers, thumbs, wrists, palms and nails of
both hands on the neck, the upper belly and the lower body
([india-instruments.com](https://www.india-instruments.com/encyclopedia-ghatam.html);
[Giridhar Udupa](https://www.ghatamudupa.com/ghatam);
[Sruti](https://www.sruti.com/articles/spotlight/pocket-guidebook-to-carnatic-music-the-ghatam)).
The bass comes from the air inside. The player closes the mouth with a palm,
or presses it against the stomach and lets it off, and the distance between
the mouth and the stomach changes the sound (Sruti;
[Wikipedia](https://en.wikipedia.org/wiki/Ghatam)).
[Chandrakantha](https://chandrakantha.com/music-and-dance/instrumental-music/indian-instruments/ghatam/)
explains this as a Helmholtz resonator whose pitch moves as the mouth opens
and closes. That is plausible physics, but nobody has measured it for the
ghatam that we found.

Two facts matter more for the kit than any single stroke:

- **Either hand plays most strokes.** Rohan Krishnamurthy's thesis says
  konnakol syllables don't say which hand plays a stroke, and calls this
  "a problem specific to the ghatam since most strokes can be played with
  both hands". Its example "Ta Ta ka ka" alternates the same stroke between
  the two hands. Ta and ki are "both performed on the main bulge along the
  crease below the mouth" (Krishnamurthy, *Virtual Gurukulavasa*, PhD,
  Eastman, 2013, pp. 139-140,
  [UR Research](https://urresearch.rochester.edu/fileDownloadForInstitutionalItem.action?itemId=28531&itemFileId=143753)).
  So a ghatam stroke id names a place and a technique, not a hand. The
  mridangam's ids name a head (`R.`, `L.`), and on a mridangam that is the
  same as naming a hand.
- **The pitch is fixed by the pot.** A ghatam can't be retuned the way a
  mridangam can. Soap, wet clay, beeswax or plasticine on the neck lowers it
  by half a note to a note (india-instruments.com;
  [a Music Academy lec-dem report](https://sriramv.com/2009/12/17/academy-lec-dem-1612/)),
  and players bring pots in several pitches. In `kit.json` terms, a pack is a
  pot, not a tuning of one drum.

### For review 1: the ghatam's strokes

The only source that names ghatam strokes by finger and place is a blog post
by Nandan Herlekar
([2012](https://abhinandan-nandanji.blogspot.com/2012/02/ghatam-what-is-it-is-also-instrument.html)),
a single source that looks to be written from the Hindustani side. Its table
is the starting point here, checked against Krishnamurthy where the two
overlap. The ids are ours. "Open?" is our guess in every row, because we
found no source that says which ghatam strokes ring and which are damped.

| Proposed id | Label | Where and how | Hand | Open? | Source |
|---|---|---|---|---|---|
| `P.ki` | ki | fingertip on the bulge below the mouth | either | closed? | Krishnamurthy |
| `P.ta` | ta | the same place as ki, another finger or the other hand | either | closed? | Krishnamurthy |
| `P.tha` | tha | middle, ring and little fingers together, upper belly | left in the source | closed? | Herlekar |
| `P.nam` | nam | index finger, upper belly | right in the source | open? | Herlekar ("Na") |
| `P.din` | din | thumb on the neck | either | open? | Herlekar ("Ku", "Na"); Krishnamurthy (din with the left thumb) |
| `P.thom` | thom | the heel of the hand or the wrist, on the neck or body | either | open? | Herlekar; Wikipedia |
| `M.gumki` | gumki | the mouth closed and opened against the stomach, or the palm over the mouth | both | open, pitch moving | Herlekar; Sruti; Wikipedia |
| `P.nail` | (nail) | fingernail flick, the neck and rim | either | closed? | india-instruments.com; Udupa |

Things to decide:

1. **One zone or two.** A zone in `kit.json` is a group of strokes that
   choke each other. On a mridangam that means a head. The ghatam has one
   clay body and one air cavity, so the simplest model is one zone, `pot`,
   where any new stroke fades the last one still ringing. The other model is
   two zones, `pot` (the shell, `P.`) and `mouth` (the air, `M.`), on the
   idea that a finger on the neck doesn't stop the air ringing. No source
   says which is true. We have written the table with two prefixes so that
   either model can be chosen without renaming anything. A player's ear, or
   a recording where a neck stroke follows a gumki, settles it.
2. **The gumki is recorded, not derived.** The mridangam's gumki is `L.thom`
   with a pitch bend added (`derived` in `kit.ts`), because on a mridangam a
   gumki is a thom whose pitch the other hand slides. A ghatam gumki is made
   another way, by moving the mouth against the stomach, and we don't know
   which way its pitch moves or by how much. So it wants recordings of its
   own. A "double gumki with the stomach and wrists" is listed as a ghatam
   speciality (lec-dem report), which is a second recording, not a bend.
3. **Rings on the fingers.** [ipassio](https://www.ipassio.com/wiki/musical-instruments/percussion/ghatam)
   says ghatam players "may wear metal rings". N. Scott Robinson says rings
   belong to the North Indian folk *ghara*, not the Carnatic ghatam
   ([nscottrobinson.com](http://www.nscottrobinson.com/gallery/ghatam.php)).
   We have left rings out of the table. If a player does use them, they are
   a stroke, not a variation of one.

### For review 2: the mridangam's letters on the ghatam

Wikipedia says the ghatam's syllables are "the same as for Mridangam", and
Krishnamurthy (p. 110) saw a teacher give mridangam and ghatam students
"practically the same composed sequence". Neither says which mridangam stroke
becomes which ghatam stroke. The mapping below is ours, working from where
each stroke is played. That makes it the part of this doc that most needs a
player.

| Mridangam letter | Mridangam stroke | Ghatam | Why |
|---|---|---|---|
| `k` | ki | `P.ki` | Same syllable, same role (Krishnamurthy) |
| `t` | ta | `P.ta` | Same |
| `n` | nam | `P.nam` | A ringing index-finger stroke |
| `d` | din | `P.din` | The thumb (Krishnamurthy's din) |
| `i` | dim | `P.din` | No separate stroke found. Stand-in |
| `v` | chapu | none | **No counterpart found**. Stand-in `P.nam`? |
| `u` | arai chapu | none | **No counterpart found**. Already missing from the mridangam kit (#80) |
| `l` | mi, a light ki | `P.ki`, softer | As on the mridangam |
| `y` | kin (ki on the meetu) | `P.ki` | A pot has no meetu, so the two ki's become one |
| `j` | tan (ta on the meetu) | `P.ta` | The same |
| `p` | tha, the left palm | `P.tha` | **A real stroke here** (below) |
| `o` | thom | `P.thom` | The heel of the hand on the body |
| `o/` | gumki | `M.gumki` | A different technique, recorded |
| `od` | thom with din | `P.thom` + `P.din` | Two hands at once |
| `on` | thom with nam | `P.thom` + `P.nam` | Two hands at once |

The row to notice is `p`. The left-hand tha is the mridangam kit's biggest
gap: half of solkattu.md's default phrase table uses it, and we have no take
(solkattu.md, review 1, point 3). On the ghatam it is a stroke any player
makes, the fingers-together tha, because either hand plays the closed finger
strokes. With `P.tha` recorded, every default phrase except the three arai
chapu ones plays on the ghatam. That makes the ghatam the first kit on which
most of the table can be heard, as long as its recordings exist (see
Datasets).

### How the ghatam brings its realization

Two ways to get from a pattern to ghatam strokes:

- **A. Solkattu to ghatam strokes.** The ghatam has its own phrase table
  (`realize/ghatam.json`), keyed by the same syllable ids as the mridangam's.
  This is solkattu.md's design as written. It suits `sol:` patterns, and
  there aren't any yet.
- **B. Mridangam letters to ghatam strokes.** The table above as a letter
  map (`realize/ghatam-from-mridangam.json`). It suits the `mrid:`-only
  patterns we have today, and it means every existing pattern plays on a
  ghatam as soon as the kit loads.

Our suggestion is both, in that order of preference. A pattern with a `sol:`
line realizes through A. A pattern with only `mrid:` goes through B, and the
compiled pattern records that it did, the same way a stand-in is recorded,
so the lane can mark it as translated rather than composed. B is a crutch.
It carries over one instrument's choices, a mridangist's `k p` for *ta ka*,
where a ghatam player might choose `P.ta P.ta` with alternating hands. That
is exactly the per-piece choice solkattu.md wants recorded in the pattern.

Either way, **`realize:` has to name its instrument**. solkattu.md's example
has a bare `realize: { ta ka: p k }`, and `p k` are mridangam letters. With
two instruments reading one pattern, it becomes:

```
realize:
  mridangam:
    ta ka: p k
  ghatam:
    ta ka: P.ta P.ta
```

An entry for an instrument the pattern doesn't mention falls through to that
instrument's table, as it does today.

### Ghatam-only strokes

The ghatam has strokes the mridangam's letters never produce: the double
stroke with both hands, the gumki with both hands, the wrist and thumb, and
the double gumki with the stomach and wrists (lec-dem report), plus nail
strokes. They reach a pattern only through an explicit `ghat:` line or a
`realize: ghatam:` entry. The default table never guesses them.

### Watch out for, on the ghatam

- **The generated fallback names mridangam strokes.** `engine/generated.ts`
  hard-codes `L.tham`, `L.thom`, `R.dhin`, `R.nam` and `R.thi` for the talas
  nobody wrote a pattern for. A ghatam kit would silently play nothing there.
  The fallback's five roles (sam, clap, wave, count, fill) belong in the
  manifest, as a `fallback` map from role to stroke id, so each kit says
  what it plays in each role. This is the one place we found where the code
  still knows what a mridangam is.
- **Detuning a pot.** A mridangam pack shifted by 200 cents sounds like a
  smaller drum (`SHIFT_WARN_CENTS`). A pot's pitch includes its air cavity,
  and we'd expect that to give the shift away sooner. That is a guess, and
  it should be measured before anyone trusts the warning threshold for a
  ghatam.
- **The mouth against the stomach damps the pot.** A player holding the
  mouth closed gives "short, dry attacks"
  ([rareinstrument.com](https://rareinstrument.com/ghatam/), a
  low-authority source). If so, the same stroke is open or closed depending
  on how the pot is held at that moment, and a single `open` flag per stroke
  doesn't describe it. A ghatam kit may want an open and a closed take of
  the same stroke as two stroke ids.

## Tabla

### What a tabla is, for the kit

Two drums: the dayan (right hand, wooden, tuned to Sa) and the bayan (left
hand, metal or clay, a low bass whose pitch the hand bends). Each head has a
rim (*kinar* or *chanti*), an open area (*maidan*, *sur*, *lao*) and a black
patch of paste in the middle (*syahi*)
([Wikipedia](https://en.wikipedia.org/wiki/Tabla);
[DigiTabla](https://digitabla.com/tabla-tradition/baj/)). Sources disagree on
what *lao* names: [TablaLegacy](https://www.tablalegacy.com/gharana-and-baaj)
calls it the edge, DigiTabla the area inside the rim.

The syllables are *bols*. A bol names a stroke, or a stroke on each drum
played at once (*dha* is *na* and *ge* together), or a short run of strokes
(*tirakita*). The bols are closer to one-to-one with strokes than solkattu
is, but not all the way (For review 4).

### For review 3: the tabla's strokes

Zones are the two drums: `dayan` (`R.`) and `bayan` (`L.`), so a tabla's ids
read the same way the mridangam's do. A left-handed player swaps the drums
between hands, but the ids name the drum, and the drum doesn't move.

| Proposed id | Label | Drum | Where and how | Open? | Source |
|---|---|---|---|---|---|
| `R.na` | na | dayan | index finger on the rim, ring finger resting on the syahi | open | [chandrakantha](https://chandrakantha.com/music-and-dance/instrumental-music/indian-instruments/tabla/tabla-basic-strokes-bols/) |
| `R.tin` | tin | dayan | index finger on the edge of the syahi and maidan; [TaalGyan](https://www.taalgyan.com/theory/basic-bols-on-tabla/) says the maidan | open | chandrakantha |
| `R.tun` | tun | dayan | index finger on the middle of the syahi, head left free | open | chandrakantha; Wikipedia |
| `R.te` | te | dayan | middle finger (or middle and ring) on the middle of the syahi, held down | closed | TaalGyan; chandrakantha |
| `R.re` | re | dayan | index finger on the middle, held down | closed | chandrakantha; Wikipedia ("Te/Re") |
| `R.tak` | tak | dayan | cupped hand on the middle | closed | chandrakantha |
| `R.ta` | ta | dayan | the last two fingers on the edge of the syahi, held down (the "small na") | closed | chandrakantha |
| `R.dhere` | dhere | dayan | the whole hand forward, the two sides of the palm in turn | closed | [Raga Junglism](https://ragajunglism.org/ragas/instruments/tabla/) |
| `L.ge` | ge | bayan | middle or index finger on the maidan, wrist resting, fingers arched | open | Wikipedia; [kksongs](http://kksongs.org/tabla/chapter03.html) |
| `L.ge/` | ge, bent | bayan | ge while the heel of the hand slides toward the syahi | open, pitch rising | kksongs; Raga Junglism |
| `L.ke` | ke | bayan | the flat hand and fingers | closed | chandrakantha |
| `L.kat` | kat | bayan | the same, with the hand further back, louder | closed | chandrakantha |

Things to decide:

1. **Record strokes or bols.** A mridangam's heads share one shell, so
   *tham* (thom with nam) was recorded as its own stroke, `L.tham`. A
   tabla's drums are two separate instruments, so *dha* sounds much like
   `R.na` and `L.ge` played at the same moment. We think it can be built
   from those two, and that saves a recording for every combined bol. It
   also leaves the bayan's bend free while the dayan rings. We suggest
   recording single strokes, plus a few takes each of *dha* and *dhin* to
   compare with the summed versions. A player will hear the difference, if
   there is one.
2. **The bayan isn't tuned to the singer.** The dayan is tuned to Sa, and a
   pack is a dayan tuning. The bayan sits roughly low and its pitch is set
   by the hand from moment to moment. Detuning the bayan's takes along with
   the dayan would shift its bass by up to a few semitones for no reason. A
   zone needs a way to say "don't follow the shruthi": a `tuned: false` on
   `Zone`, which `play` treats like an unpitched pack. It is a small format
   change, and old kits don't need it.
3. **The bend is a gesture, not a stroke.** The mridangam's derived gumki
   is a fixed bend applied as the stroke starts (300 cents over 0.25 s,
   itself a guess). On a bayan the player strikes ge and slides the wrist
   toward the syahi to swoop the pitch up, or starts pressed and slides away
   to swoop it down (kksongs). The bend often comes a moment after the
   stroke, on a note that is already ringing. We found no figure for how far
   it goes. The existing `derived.bend` covers the simple case, and it
   already takes negative cents for a downward swoop. A bend that starts
   later is an event of its own on a ringing note, like the thambura's
   `damp`. We'd leave that for later and ship `L.ge/` as derived.
4. **Choking.** Per drum, as the kit already does it: a new stroke on the
   bayan fades the one still ringing there (`L.ke` stops `L.ge`, as a flat
   hand stops the skin), and the dayan never chokes the bayan. The two
   fingers resting on the syahi during *na* are part of how *na* sounds, not
   a choke.

### For review 4: the bols

Same shape as solkattu.md's review 2. The ids live in their own namespace
(`bol:`), separate from solkattu, so the bol `ta` and the solkattu `ta` can
never be confused in a table or a link. "Strokes" is the default
realization: `+` means both drums at once, a space means strokes in order.

The class column is the four timbre classes of
[Rohit, Bhattacharjee and Rao, ISMIR 2021](https://archives.ismir.net/ismir2021/paper/000001.pdf):
**D** damped, **RT** only the dayan rings, **RB** only the bayan rings, **B**
both ring. It is how a stroke sounds, whichever bol it is written as. It is
also what a player hears first, so it is a useful check on the table.

| Id | Shown as | Aliases | Strokes | Class | Status |
|---|---|---|---|---|---|
| `dha` | dha | dhaa, धा | `R.na+L.ge` | B | merge |
| `dhin` | dhin | dhi (in thekas), dhim, धिं | `R.tin+L.ge` | B | merge; **hold** `dhi` if a gharana plays it apart |
| `dhe` | dhe | | `R.te+L.ge` | RB | |
| `dhet` | dhet | dhit | `R.tak+L.ge`? | RB | unsure which dayan stroke |
| `na` | na | ना | `R.na` | RT | keep apart from ta (below) |
| `ta` | ta | ता | `R.na` (Delhi), `R.ta` (Purbi) | RT or D | **hold**: realized per gharana |
| `tin` | tin | तिं | `R.tin` | RT | keep apart from ti |
| `ti` | ti | | `R.te` | D | **hold**: chandrakantha says it is often another name for tin |
| `tun` | tun | tu, thu, thun | `R.tun` | RT | merge |
| `te` | te | ते | `R.te` | D | |
| `ṭe` | ṭe | टे | ? | D | **hold**: DigiTabla lists it as a second te |
| `re` | re | ra | `R.re` | D | merge |
| `tak` | tak | तक् | `R.tak` | D | |
| `ge` | ge | ga, ghe, gha, gi, ghi, ग | `L.ge` | RB | merge |
| `gin` | gin | ghin | `L.ge` | RB | **hold**: kksongs lists it with ge, CompMusic puts it under din |
| `ke` | ke | ka, ki, क | `L.ke` | D | merge |
| `kat` | kat | | `L.kat` | D | **hold**: louder, used for accents (Ektaal's *kat ta*) |
| `tete` | tete | teṭe, tita, तेटे | `R.te R.ta` | D | merge; "at least five techniques" (chandrakantha) |
| `tirakita` | tirakita | tirkit, tiraktika, तिरकिट | `R.te R.re L.ke R.ta` | D | merge; fingering varies by gharana |
| `kra` | kra | kda, kran, क्ड़ां | `L.ke R.ta`, a flam | D | **hold**: a flam, not a chord (Raga Junglism) |
| `dhage` | dhage | | `dha ge` | B, RB | a phrase, not a bol of its own |
| `dhere` | dhere | dhir, dhera | `R.dhere` | D | |

Where a source is used: the **CompMusic Tabla Solo dataset** merges 41
written syllables into 18 classes by how they sound
([syllable mapping](http://compmusic.upf.edu/system/files/static_files/Tabla-SyllableMapping_0.pdf)).
Several of its merges are ours too: ge from ga, ghe, gi and ghi, and ke from
ka, kat and ki. Others we have held apart. It puts *kat* under ke, and we
hold *kat* for its accent. It puts *na* with *taa* and *tu*, where we give
*ta* a realization per gharana and *tun* its own. And it puts *kda* with *kra*
and *kru*, which we agree with. A dataset merges by timbre, to train a
classifier, and a teacher distinguishes what the hand does, so the two sets
of merges shouldn't be expected to agree. We have taken the teacher's side
wherever they differ. The mapping file is a PDF on the CompMusic site and is
used here as a reference, not as data we ship.

### Where the bols aren't one-to-one

- **The same bol, different strokes.** The ISMIR paper says "the same bol
  (e.g., Na) can sometimes be used to refer to strokes of very different
  types", and that its labels had to be checked by hand. *Ta* in Delhi style
  is "exactly like Naa". In Purbi style it is played in the maidan
  (chandrakantha). There are "at least four different ways to play Dhin",
  and the dayan's half of *dha* is loud in Purbi style and "barely audible"
  in Delhi's (chandrakantha).
- **Gharanas.** Delhi and Ajrada play on the rim (*kinar baj*), with single
  fingers for *tete* and *tirakita*. Lucknow, Farukhabad and Benares play
  inside the rim (*purab baj*), fingers together and more open. Punjab mixes
  the two, and today every gharana uses both
  ([DigiTabla](https://digitabla.com/tabla-tradition/baj/);
  [TablaLegacy](https://www.tablalegacy.com/gharana-and-baaj)).
- **What that means for us.** The mridangam's banis differ in which strokes
  a phrase gets. The tabla's gharanas differ in how a single bol is played.
  So the tabla's per-gharana choice lives in the bol table as one realization
  per baj (`delhi`, `purab`), picked per kit or per pattern, rather than as a
  per-pattern override on every *ta*. We suggest shipping one baj first, and
  since a kit comes from one player, the player's own.

### For review 5: taals against TalaGrid

`TalaGrid` takes a list of beats, each with an image (`down` for a clap,
`open` for a wave, `one`..`five` for finger counts), and its `shape` is those
images joined: `down one two three down open down open` for Adi. Patterns
match a tala on its shape plus its length. A Hindustani taal maps onto that
directly:

- A **matra** is a beat, one count long.
- A **tali** (a clap opening a vibhag) is `down`. A **khali** (a wave) is
  `open`. Every other matra is a count: `one`, `two`, `three`, the hand
  images we already have.
- **Sam** is the cycle's first beat. It needs no image of its own, just as
  Adi's first clap doesn't.
- A **vibhag** is the run from one `down` or `open` to the next. It isn't
  stored anywhere and can be read off the images.

| Taal | Matras | Vibhags | Marks | Shape | Theka |
|---|---|---|---|---|---|
| Teentaal | 16 | 4 4 4 4 | X 2 0 3 | `down one two three down one two three open one two three down one two three` | dha dhin dhin dha / dha dhin dhin dha / dha tin tin ta / ta dhin dhin dha |
| Jhaptaal | 10 | 2 3 2 3 | X 2 0 3 | `down one down one two open one down one two` | dhi na / dhi dhi na / ti na / dhi dhi na |
| Rupak | 7 | 3 2 2 | X 2 3, with X a wave | `open one two down one down one` | tin tin na / dhi na / dhi na |
| Ektaal | 12 | 2 2 2 2 2 2 | X 0 2 0 3 4 | `down one open one down one open one down one down one` | dhin dhin / dhage tirakita / tu na / kat ta / dhage tirakita / dhi na |

Sources: [Teental](https://en.wikipedia.org/wiki/Teental),
[Jhaptal](https://en.wikipedia.org/wiki/Jhaptal),
[Rupak](https://en.wikipedia.org/wiki/Rupak_Tala) and
[Ektaal](https://en.wikipedia.org/wiki/Ektaal) on Wikipedia, and
chandrakantha's pages for the clap positions
([Jhaptal](https://chandrakantha.com/music-and-dance/i-class-music/index-of-tals/jhaptal/),
[Rupak](https://chandrakantha.com/music-and-dance/i-class-music/index-of-tals/rupak/),
[Ektal](https://chandrakantha.com/music-and-dance/i-class-music/index-of-tals/ektal/)).
Two readings we couldn't confirm: the fetched Ektaal page gave the fourth
vibhag as "kat tin", where "kat ta" is the usual form, and the Teental
article says a khali vibhag opens on *na*, which disagrees with its own
theka.

What this turns up:

1. **Rupak fits.** The grid takes any list of images, so a cycle that opens
   on `open` is just a shape that starts with `open`. The sources disagree
   on how it is marked. Wikipedia writes "X | 2 | 3" and says "both the
   khali and sam … fall on the first matra", while chandrakantha marks beat
   1 as a wave and puts the claps on 4 and 6. The shape above follows
   chandrakantha, which is what a student's hands do. What does assume a
   `down` on sam is `generated.ts`, which gives sam both heads. On Rupak,
   sam is khali, and khali withholds the bass. The fallback would play a
   loud bass stroke exactly where the taal says there isn't one. The tabla's
   fallback is its theka anyway (below), so this only bites a kit with no
   theka for the taal.
2. **Khali is played, not only waved.** In Teentaal's third vibhag *dhin*
   becomes *tin* and *dha* becomes *ta*: the same dayan strokes without the
   bayan (Wikipedia, Tala: "no bass beats"). That lives in the theka, not
   in the grid, so the grid needs nothing new for it.
3. **Two claps may not look the same.** Sam (X) and the other talis (2, 3)
   are both `down`. Hindustani notation always marks sam apart from the
   rest, where our images don't need to. The lane could mark sam from its
   position without a new image.
4. **Nadai and laya.** Our sapta talas carry a nadai (the number of ticks
   in a beat). A Hindustani taal has *laya*, a speed (vilambit, madhya,
   drut) rather than a subdivision, and a theka's bols fall one per matra
   unless the theka is written with more. Vilambit Ektaal is often under 20
   matras a minute, and `MIN_TEMPO` is 10, so the range covers it.
   A taal wants one tick per matra and no nadai menu.
5. **Where taals go in the menu.** `TalaId` is `sapta_*`, `chaapu_*` or
   `custom_*`. Taals want a family of their own (`taal_teen`, `taal_jhap`
   and so on), laid out as a list of vibhags with their marks, from which
   the beats are built the way `customTalaBeats` builds Adi. The family
   decides which menu they appear in, and whether the hands show finger
   counts between claps or leave the matras bare. In Hindustani practice
   the claps and waves are usual and the finger counts less so.

### Theka: a pattern, a counting line, or both

Both, and this is where the tabla is different in kind from the mridangam.

- **It is a composition.** DigiTabla says "a theka is a *composition*, and
  not essentially a rhythm". It is filled in and decorated at slow tempos,
  and some thekas show their taal's structure more clearly than others
  ([DigiTabla](https://digitabla.com/reference/compositional-forms/theka/)).
  As a pattern, a theka is the tabla's main role, as a sarvalaghu is the
  mridangam's.
- **It is also how the taal is counted.** A student learns Teentaal as
  *dha dhin dhin dha*, where a Carnatic student counts Adi on the hands and
  in *ta ka di mi*. Martin Clayton writes that the theka "comes to be
  identified with the metre", although a taal doesn't in itself imply a
  drum pattern
  ([Clayton, Durham repository](https://durham-repository.worktribe.com/OutputFile/1539355);
  we read this in a search result, not the full text).

solkattu.md keeps counting syllables away from the realizer so that the app
never plays the count as strokes. The theka is the case where playing the
count as strokes is correct. So we propose:

- The taal's definition carries its theka as bol ids, as display data. It is
  the taal's counting line in the lane when no tabla pattern plays, as
  *ta ka di mi* is for a Carnatic tala.
- The tabla's pattern library has a theka pattern per taal (role `main`),
  written as a `bol:` line. The build compiles it from the same file and
  checks that the pattern's bols match the definition's.
- The counting line itself still never reaches the realizer. The pattern is
  what plays. The two only happen to be written from one source.

Variations of the theka (the filled-in slow forms, a *tihai* to end on sam)
are patterns with roles `variation` and `korvai`, the same way the
mridangam's are.

### Watch out for, on the tabla

- **Shared spellings, different words.** `ta`, `na`, `dhin`, `ki` and
  `tak` are solkattu ids and bol ids. The two tables must live in separate
  namespaces, and share links and saved patterns must carry which one an id
  belongs to. A korvai written in solkattu shouldn't find a tabla
  realization for *ta ka* by accident. A tabla playing a Carnatic korvai (a
  fusion thing, not a practice one) is a separate question, not a side
  effect.
- **Dha isn't always a chord.** *Dhage* and *dhere dhere* start with *dh*
  and are phrases or single hand shapes. The parser must match whole bol
  ids, not guess from the spelling. Bols run together in writing as solkattu
  does (*dhagetirakita*), so the rule from solkattu.md holds: reject a split
  that could go two ways.
- **Tirakita changes shape with speed.** At speed it is played as *traka*,
  three strokes in the time of four (Wikipedia, Ektaal). That is the same
  problem as solkattu.md's *ta ri ki ta*, and it gets the same answer: an
  entry per speed.
- **A theka at vilambit is not the drut theka slowed down.** The slow forms
  are filled in. A single theka stretched to 15 matras a minute will sound
  like a machine. It is worth a slow-form pattern per taal before anyone
  hears vilambit.

## Datasets and recordings

Licences as each dataset's own page gives them, read from Zenodo's API on
2026-09-28 where the record is on Zenodo. We ship only sounds licensed for
it.

| Dataset | What it has | Licence | Usable for a kit? |
|---|---|---|---|
| [Tabla strokes dataset](https://zenodo.org/records/4327350) (Subodh Deolekar) | 9 classes x 50 WAVs (Da, Dh, Di, Ge, Ka, N, Na, T, Ta), tuned to C# | CC BY 4.0 | **Yes**, to try: one tuning, and its labels need mapping to our ids |
| [4-way Tabla Stroke Classification](https://zenodo.org/records/7110248) (Rohit, Bhattacharjee, Rao, IIT Bombay) | about 26,600 training and 4,500 test strokes in phrases, labelled D, RT, RB, B | CC BY 4.0 | For onsets and checking, not for takes: the strokes are in context and labelled only by class |
| [Freesound pack 8162](https://freesound.org/people/mmiron/packs/8162/) (mmiron, tabla bols) | single strokes: ta, te, re, na, tun and others | CC0 for the four sounds checked; the rest unchecked | Possibly. Check every sound's page |
| [Tabla Solo dataset](https://zenodo.org/records/1267024) ([CompMusic](https://compmusic.upf.edu/tabla-solo-dataset)) | 38 teentaal compositions from the *Shades of Tabla* DVD, 8,200 syllables | Restricted on Zenodo, with no licence field. CompMusic: "available for research purposes" | **No** |
| [Hindustani Music Rhythm dataset](https://zenodo.org/records/1264742) (CompMusic) | 151 excerpts in four taals, sam and matra annotated | Restricted, no licence field | No; perhaps to test taal shapes |
| [Saraga 1.5](https://zenodo.org/records/4301737) | ghatam stems in Carnatic concerts, with bleed from the other instruments, no stroke labels | CC BY-NC-SA 4.0 | No: non-commercial, share-alike, and not isolated |
| [Sanidha](https://ccml.gtcmt.gatech.edu/data/Sanidha) (Georgia Tech) | ghatam stems, two mics, in three of five concerts, about 2.3 h | "CC BY 4.0", by emailed request and VPN | **Maybe**: the one open ghatam source, but concert stems we would have to cut and label ourselves. The page and the paper disagree on which concerts have a ghatam |
| [Freesound "ghatam"](https://freesound.org/search/?q=ghatam) | two improvisations, no single strokes | CC BY and CC0 per the listing, pages unchecked | No |
| [Mridangam Stroke Dataset](https://zenodo.org/records/4068196) | our mridangam kit's source | **CC BY-NC 4.0** | See below |

Nothing openly licensed has isolated ghatam strokes. For the ghatam, the
choice is between cutting takes out of Sanidha's stems, which means asking
for access and then segmenting and labelling it all by hand, and a
recording session. A session gives us the zone question (a neck stroke
recorded after a gumki) and the open and closed takes at the same time. We
suggest the session.

For the tabla, Deolekar's set is enough to build a first kit and hear the
summed *dha* against a recorded one. It has one dayan tuning, so every other
shruthi is a shift from C#.

**The mridangam dataset's licence has changed, or was misread.**
`mridangam.md` says Zenodo and mirdata gave CC BY 3.0 and Freesound CC BY-NC
3.0. Both Zenodo records for it (4068196 and 1265188) now say
`cc-by-nc-4.0`, and the kit's data repo records no licence. That is outside
this doc's scope, but it bears on "we only ship licensed sounds", and it
should be settled before a ghatam or tabla kit copies the mridangam kit's
packaging.

## Build order

Nothing here needs doing before solkattu.md's own build order has settled
the names. After that:

1. **A `fallback` map in `kit.json`**, so `generated.ts` stops naming
   mridangam strokes. It is small, and every other kit needs it.
2. **`realize:` keyed by instrument**, and the letter map from mridangam to
   ghatam (route B). Existing patterns play on a ghatam from then on.
3. **A ghatam recording session**, then the kit, one zone or two by what the
   recording shows.
4. **`tuned: false` on a zone**, then a tabla kit from Deolekar's strokes to
   try, with *dha* summed.
5. **Taals as a tala family**, with thekas as both the counting line and a
   `bol:` pattern.
6. Later: bends that start after the stroke, slow thekas, a second baj.

## Questions for a player's ear

These are the questions we couldn't answer from sources and shouldn't guess:

1. **Ghatam, open or closed**, per stroke in review 1. And does holding the
   mouth closed against the stomach turn open strokes closed?
2. **Ghatam, one zone or two.** Does a finger stroke on the neck cut a
   gumki's bass, or does the bass ring on under it?
3. **Ghatam gumki.** Which way does the pitch move, by how much, and over
   how long? Is the double gumki one stroke or two?
4. **The letter map (review 2).** Is *tha* the fingers-together stroke? Does
   the chapu have a ghatam counterpart, or is *nam* a fair stand-in? And
   would a ghatam player ever play *ta ka* as a mridangist's `k p`, or always
   with alternating hands?
5. **Tabla, summed or recorded *dha*.** Can you hear the difference between
   `R.na` and `L.ge` played together and a recorded *dha*?
6. **Tabla bols (review 4).** Is *ti* its own stroke or another name for
   *tin*? Is *ṭe* a second *te*? Which dayan stroke is in *dhet*? Should
   *gin* be *ge* or *din*? And for the player we record, which baj is
   *ta*?
7. **The bayan's bend.** How far does ge swoop, up and down, and does a
   player bend at the stroke or a moment after it?
8. **Rupak's first beat.** Clap or wave, for a student counting along?
9. **Ektaal's fourth vibhag.** *Kat ta* or *kat tin*?

## Open questions

1. **Who records the ghatam**, and in how many pots (pitches)?
2. **Which baj first** for the tabla, which should follow whoever plays for
   the recording.
3. **Does a tabla ever play solkattu here?** If not, the two namespaces
   never meet and the question is closed. If so (a fusion pattern), it gets
   its own design.
4. **The mridangam dataset's licence**, above.
