# Adding the mridangam

This is the plan for the mridangam, in the four parts we care about: the
primitive strokes and how they tune to the shruthi, how strokes are put
together into patterns for each tala, how the sounds and patterns are
packaged, and what the views look like. It ends with the order to build it in
and the questions we still need answered. `architecture.md` covers the
timing and audio machinery this builds on.

The research behind it is linked inline. The acoustics lean mostly on a 2023
review of Umayalpuram K. Sivaraman and T. Ramasami's book *Musical
Excellence of Mridangam* ([arXiv 2307.09425](https://arxiv.org/pdf/2307.09425)),
which summarises measurements of the book's studio recordings. We call it
"the review" below.

## What the existing apps do

We looked at the apps people actually use. The short version is that pretty
much all of them play fixed recorded loops, and only one lets you compose.

| App | What it is | Worth borrowing | What users complain about |
|---|---|---|---|
| [Jalra](https://jalra-app.web.app/) (the most installed, 500K+ on Android) | loops per "beat count", tambura, morsing | runs in the background, any pitch | "talam is not in layam"; lost purchases; a paid 4-slot grid editor |
| [Mridangam Studio](https://kalyanstudioapps.com/carnatic-music.html) | loops recorded by Sumesh Narayanan, time-stretched | real playing, 12 keys with fine tune | five talas only; a 1.1 GB download |
| [Layam](https://apkpure.com/layam-carnatic-metronome/com.abheri.laya) | real recordings at fixed tempos | mohra and korvai endings | fixed tempo steps; has to start at edam |
| [My TalaVadyam](https://www.upbeatlabs.com/my-talavadyam/) | the only composer: 15 strokes, 16 stock phrases, drag-and-drop tiles | 1st/2nd/3rd speed, separate pitch and volume per head, a view of the phrase playing | no tambura ("hard for my dance classes") |
| [Talanome](https://www.upbeatlabs.com/talanome/) | tala keeper, all 108 talas | a count-in for eduppu | a redesign that confused its users |
| [Tala Keeper](https://talakeeper.org/notes.html) | tala keeper | patterns tapped on pads drawn as the two drum heads; patterns shared as URLs that play in a browser | |
| [iTablaPro](https://apps.apple.com/us/app/itablapro-tabla-tanpura-player/id337350026) (tabla) | loops per taal | different patterns for slow, medium and fast tempos; an auto-tuner to your harmonium | "same old beats" |
| [TaalMala](https://apps.apple.com/us/app/taalmala/id900947127) (tabla) | loops plus a bol composer | bols typed as text; variations picked at random, or picked to suit the tempo | "horribly buggy", "cluttered", 5 free minutes an hour |

(Download counts and ratings are from store pages and aggregators, and the
features are mostly from the apps' own descriptions, so treat them as
marketing unless a review backs them up.)

Two things stand out for us. The complaint that hurts most is timing that
drifts, and our timing is already the strongest part of the app (the shared
`TempoMap` exists for exactly this). And nobody pairs a composable
mridangam with a good drone, which is the thing a web app with a thambura
already built is well placed to do.

## 1. Primitives

### The strokes

The right head (valanthalai) has a black patch (soru or karanai) that makes
its modes nearly harmonic, as C.V. Raman showed in
[1935](https://ed.iitm.ac.in/~raman/1935PIAS.pdf). The left head (thoppi)
is a bass, loaded with a blob of rava paste. A stroke is *open* when the
head is left to ring and *closed* when the hand stays on it.

| Stroke | Head | Open or closed | What you hear | Pitch, relative to chapu |
|---|---|---|---|---|
| chapu (muzhu chapu) | right, little finger between patch and rim | open, rings for seconds | the tuning stroke | Sa, by definition |
| arai chapu | right | open, sharper and more metallic | | upper Sa or Pa (sources disagree) |
| nam (meetu) | right, index finger near the rim | open, short | metallic | Pa (review) or Sa (a tuning guide) |
| dheem | right, on the patch | open, long | low and full | around Ri (the first mode sits about 7% sharp) |
| dhi / thi | right, middle of the patch | closed | short but still pitched | |
| ta | right, centre of the patch | closed | a dry click | unpitched |
| thom | left, outer part | open | the bass | roughly lower Sa or Pa |
| tha | left, centre | closed | a thud | unpitched |
| gumki | left | open, with the pitch bent | "cooing of the dove" | a thom that slides |
| tham | both | open | nam or chapu with thom | composite |

The pitches come from the review's measured ratios (nam is 1.5× chapu,
dheem about 0.535×) and from
[mridangams.com](https://www.mridangams.com/),
[Mysore Vadiraj](http://mysorevadiraj.blogspot.com/2016/04/basic-strokes-of-mridangam.html)
and [classicmridangam](http://classicmridangam.blogspot.com/2015/08/advance-strokes-in-mridangam.html).
They disagree in three places (arai chapu, nam and the thoppi's pitch), and
the names aren't standard either, as far as we can tell. The one public stroke dataset labels its
classes Bheem, Cha, Dheem, Dhin, Num, Ta, Tha, Tham, Thi and Thom, and we
couldn't find what Bheem is. So the plan doesn't hard-code any pitch from the
literature. Each sample's pitch gets measured from the recording itself (see
Tuning below), and a kit's manifest says what each of its strokes is.

In code, a stroke id carries its head, `R.chapu` or `L.thom`, so the right
head's ta and the left head's tha can't be confused. A composite like tham is
a list of primitives, `R.nam + L.thom`, struck together or up to about 30 ms
apart, which is how a player's two hands actually land
([Chandramouli & Sethares](https://arxiv.org/pdf/2211.15185)). We record the
primitives and build the composites, instead of recording every combination.

**Solkattu isn't strokes.** The spoken syllables and the strokes played don't
map one to one. The syllable *ta* covers
[eleven different strokes](https://ancient-future.com/indiamap.html), and *ta
dhi gi na thom* is played as *dhi ta dhi na thom*
([source](https://algorithmicpattern.org/patterns-in-konnakol/)). So patterns
are written in strokes, and the solkattu is a separate line of text shown
alongside them. A phrase's mapping is decided per phrase, by someone who
plays, not per syllable by a table.

### Gumki

A gumki is a thom whose pitch the player bends with the other hand on the
left head. It only works with paste on the head. Nobody we read gives numbers
for how far or how fast it bends, so it goes in as a parameter to tune by ear:
`AudioEngine.play` gains a `bend` option that ramps the note's `detune` from
0 to some cents over some time, and the gumki stroke is a thom sample played
with a bend. Something like +200 to +400 cents over 150-400 ms is our guess to
start from, and a real player should correct it.

### Tuning to the shruthi

The thambura already knows the tonic (`tunedTonicHz` in `shruthi.ts`). The
mridangam follows it: every right-head sample is played with a detune that
moves its chapu onto Sa. A player tunes the real drum the same way, tapping
the straps while playing chapu against a shruthi box.

The catch is range. A real drum only covers a few semitones, which is why
players keep several
([mridangams.com](https://www.mridangams.com/2007/09/size-shape-measurement-pitch-of.html)).

| Drum | Pitch range | Kattai |
|---|---|---|
| men's (thagu shruthi) | B to C# | ¾ to 1½ |
| women's (sthaayi shruthi) | F to A# | 4 to 6½ |

Playing a sample faster raises its pitch but also shortens its decay and
sharpens its attack by the same ratio, so a stroke shifted far sounds like a
smaller drum. We found no study that says how far is too far, and our own
guess is within about ±2 semitones. So a kit carries recordings at a few
tonics, and we play the nearest one and shift it the rest of the way. For the
thambura's 15 keys (A2 to B3) that means recordings from both a men's and a
women's drum. The one public dataset (below) covers only B to E, the men's
range.

The left head isn't tuned precisely on a real drum. Sources put it at the
tonic, an octave down, or the lower Pa. We shift it by the same amount as the
right head, so the drum's own balance stays as recorded, and a "thoppi pitch"
setting lets you nudge it (My TalaVadyam does the same).

Measuring each sample's pitch is a small script over the kit, using the same
autocorrelation `thambura.test.ts` uses (`detectHz`). One trap to handle is
that chapu's strongest partial is the second harmonic, heard as Sa, while the
fundamental below it is weak, so a naive detector can land an octave low. We
can check each measurement against the other strokes' expected ratios.

### Where the sounds come from

Three options, and we'd like your call on them (see Open questions).

1. **The CompMusic/IIT Madras Mridangam Stroke Dataset**
   ([Zenodo](https://zenodo.org/records/4068196)). 10 stroke classes at 6
   tonics, B to E, 6,977 WAV files from one player, 130 MB. The takes
   are plentiful, so choosing a few good ones per stroke is easy. The licence
   is unclear, though. Zenodo and mirdata say CC BY 3.0, while the same
   sounds on Freesound are CC BY-NC 3.0. We shouldn't ship it without
   checking Zenodo's page (it was down while we looked) and, better, asking
   the authors. It also only covers the men's range.
2. **Record our own.** A player, a men's and a women's drum, each tuned to
   two or three tonics, every primitive stroke three or four times, each hit
   let to ring out, in a quiet room with no effects. That's probably an hour
   or so in a room, and it gives us a kit we own and can ship.
3. **Synthesize.** The open right-head strokes (chapu, arai chapu, nam,
   dheem) are a handful of decaying harmonics at known ratios, much like a
   tambura pluck, and they'd tune to any key exactly. The review gives
   numbers to start from: dheem against chapu at 0.534 ± 0.005, nam at
   1.5 ± 0.012, dheem against the ghost fundamental at 1.07 ± 0.05, and an
   intensity decay constant for dheem of 2.02 per second (about 1.1 s to
   -10 dB). It also reports beating in dheem from two close frequencies,
   which is the trick `thamburaPresenter` already plays with its 1.5-cent
   sharp second Sa, and a cheap way to keep a synthesized dheem alive. The closed strokes and
   the thoppi are noisier and quite a bit harder. Nobody has published a mridangam synth
   that we could find, so this is an experiment.

Our suggestion is to build the engine against the dataset locally (kept out
of git, like `recordings/`), while getting permission or booking a recording,
and to try synthesizing the open strokes on the side to compare. Only
licensed sounds get deployed.

### What's in the dataset, measured

We downloaded it and measured every class, because the labels turn out not to
mean what the literature means. Writing F for the pack's nominal note (130.8 Hz
for the C pack) and T40 for the time to fall 40 dB:

| Label | Head | Strongest partial | T40 | What it looks like |
|---|---|---|---|---|
| bheem | right | 1.07F | 0.77 s | the review's *dheem*, the first mode sitting 7% sharp |
| cha | right | 2F, the Sa | 0.33 s | the tuning stroke, chapu |
| dhin | right | 2F, with a strong 3F | 0.38 s | a second Sa-pitched open stroke |
| num | right | 5F | 0.20 s | metallic and high |
| thi, ta, tha | right | none dominant | 0.14 s | the closed strokes |
| thom | left | about 0.67F | 0.31 s | the bass |
| dheem | left | about 0.67F, some 2F | 0.40 s | bass-led, right head ringing along |
| tham | left | about 0.67F, some right head | 0.32 s | the composite |

Three things follow.

**The names don't line up.** The dataset's `dheem` is a bass stroke, while
its `bheem` is what the review calls dheem, and we still don't know what the
name `bheem` is meant to be. That is the best argument yet for measuring every
sample and trusting no label, which is what the section above already says.

**The tuning stroke really does sound harmonic 2.** In `cha` and `dhin` the
partial at the pack's nominal note is stronger than the one an octave below
it. So a pack matches a thambura key by pitch class, and the octave takes
care of itself.

**`num` disagrees with the review**, which measures nam against chapu at 1.5,
the third harmonic against the second. Here the fifth dominates.

Each pack is also a little off its nominal note, by a few cents up to about
20, with D the flat outlier. Two passes over the data with different methods
agreed on the direction but differed by up to 10 cents on the value, so the
kit build needs one agreed way of measuring, and the manifest should carry a
measured detune per pack.

Then the caveats, which matter for what we can build from it:

- **The rings are cut.** About a fifth of the `cha` and `thom` takes are
  still above -40 dB where the file ends, and the longest `cha` is 0.77 s
  (median 0.23 s). So this dataset cannot give us a chapu that rings for
  seconds, which is what a real one does.
- **The E pack clips.** 16% of its files touch full scale. No other pack
  does.
- **The classes are lopsided:** 2,164 `thi` takes against 49 `bheem`, and
  `bheem` has none at D and one at C#.
- **No gumki and no arai chapu** at all.
- **The packs aren't one drum retuned.** Level, brightness and decay move
  between them unsystematically, so a kit built from them wants normalizing
  per pack, and they can't tell us how far a sample survives being shifted.

Sizes, now measured rather than guessed. Four clean takes per stroke per
tonic is 232 files and 97 s of audio: about 1.2 MB at 96 kbps mono, and
3.1 MB decoded per pack (18.6 MB for all six), which is what the packaging
table below now uses.

### What the audio engine needs

Most of it exists already. `play` takes detune, gain, pan and a choke group,
and the `percussion` bus has its own volume. The additions:

- `bend` on `PlayOptions`, for the gumki.
- One choke group per head. A closed stroke on a head cuts the ring of the
  last open stroke on that head, as the hand landing on the skin does. A
  right-hand stroke never chokes the left head. The choke fade is a fixed
  80 ms today, set for strings, and drums want something nearer 5-10 ms, so
  it becomes a per-note option.
- A take picked per stroke from the step's `variant` draw, plus a little gain
  jitter, so repeated strokes don't sound machine-gunned. The thambura
  already does the jitter.
- Separate left and right levels, so the student can bring the bass up or
  down.

## 2. Patterns

### The layers

- A **stroke** is one primitive or composite at a musical position.
- A **phrase** is a short named group, the way a player thinks in "tha dhi
  thom nam".
- A **pattern** lays phrases and strokes out over some number of aksharas,
  and has a role. A *sarvalaghu* is the flowing basic pattern for a tala, nadai and speed. A
  *variation* is another loop of the same length to swap in. A *fill* replaces
  the end of a cycle. A *mohra* or *korvai* is a multi-cycle ending that lands
  on sam (or on the eduppu).
- An **arrangement** decides what plays each cycle: mostly the pattern, a
  variation now and then, a fill every few cycles, and a korvai when asked.

### Writing patterns down

Patterns are plain text, so they're easy to write, review in a PR, and share.
A sketch of the format:

```
pattern  adi-chatusram-1
tala     custom_adi
nadai    chatusram
speed    1
role     pattern

| tha  dhi  thom nam  | tha  dhi  thom nam  | ...
| ta   ka   dhi  mi   | ta   ka   dhi  mi   | ...
```

The first line of strokes is what plays. The optional second line is the
solkattu, shown in the view and never played. Each token takes one slot, and
a slot is 1/(g × 2^(s-1)) of a count, where g is the nadai's group (3, 4, 5, 7
or 9) and s the speed. Speeds double rather than step: first speed is one
unit per beat, second is two, third is four
([eviolinguru](https://www.eviolinguru.com/kaala-tempo.html)). A `,` is a rest for one slot, as karvai is written in
Carnatic notation. `R.nam+L.thom`, or a composite's short name `tham`, plays
several primitives at once. `|` marks an akshara boundary and has to fall on
one, which is what makes a typo in a long pattern easy to catch. The parser
turns all of it into strokes at exact `Ratio` positions, and a vitest suite
parses every bundled pattern and checks it fills its cycle exactly.

Which slot count "first speed" means is a naming question we'd like settled
with a player (see Open questions). The format only needs g and s.

### How it plays

The mridangam is another track on the tala's `Transport`, on the same
`TempoMap`, so it starts and stops with the claps and can't drift from them.
`transport.test.ts` already proves two voices on one map stay locked through
tempo changes. The new pieces:

- **`TalaGrid`** (engine). Turns the tala's beats and kalai into a cycle
  length in counts and answers "which cycle, beat and akshara is count x".
  Both the stroke sequencer and the view need this, and nothing exposes it
  yet.
- **`StrokeSequencer`** (engine), a `Sequencer<StrokeEvent>` on the tala's
  map. At each cycle boundary it asks the arrangement which pattern plays
  this cycle, queues that pattern's strokes at exact positions, and hands
  each out when its own time enters the look-ahead window, as the tala's
  ticks do now.
- **The arrangement** (engine, pure). Picks pattern, variation, fill or korvai
  per cycle from the settings and a seeded random draw, so it's testable and
  repeatable.
- **The presenter.** The mridangam rides the tala's transport, so it belongs
  to the tala island. `PlayerPresenter` gets a mridangam track and its state,
  and `main.ts` wires the thambura's tonic into it whenever the thambura's
  settings change.

What to play for each tala and nadai has three sources, in order: a curated
pattern from the library, a pattern that fits the tempo (sparser patterns at
high tempos, the iTablaPro idea), and a generated fallback. The fallback is
kept simple on purpose: tham on sam, a stroke on each beat that follows the tala's
angas (a bass stroke on the claps, lighter strokes on the finger counts, chapu
on the waves), and a stock phrase for the nadai inside each count. It means
every tala in the menu gets something, even the rare ones, while the
curated library grows.

Later, the parts that make practice more useful than a loop:

- **Variations drawn from a pool**, so it isn't the same eight beats for
  twenty minutes (the top complaint about every app).
- **Fills every N cycles**, and a **korvai button** that plays an ending
  landing on sam, which cues a singer the way an accompanist would.
- **Eduppu.** Start the pattern, and aim the korvai, at an offset from sam
  (half an akshara, three quarters, and so on), plus a count-in so nobody has
  to start at edam.
- **Tempo ramps** for practice, since the map already handles smooth tempo
  changes.

## 3. Packaging

### Where the data lives

Sound data and the tools that make it live in a companion repo,
[panyam/thambura-data](https://github.com/panyam/thambura-data): the measuring
and kit-building scripts, the built kits, a note on where each source came
from, and a stroke pad page for listening. Raw sources are fetched by a script that checks a
hash, never committed, since the stroke dataset's zip alone is 125 MB.

The kit the app ships is a build product copied into this repo under
`web/static/Resources/Mridangam/<kit>/`, not a submodule. At about 1.2 MB
that's cheap, and it keeps `gcloud app deploy`, the offline service worker and
a plain clone all working without extra steps. Nothing there should be
hand-edited.

### Sound kits

A kit is a folder under `web/static/Resources/Mridangam/<kit>/`: a
`kit.json` manifest, the audio files and a `CREDITS` file with the licence.
The manifest lists, per tonic recorded, the measured chapu pitch, and per
stroke its head, whether it's open, its measured pitch relative to chapu,
and its takes (file and gain). Composites are defined in the engine, so every
kit gets tham for free once it has nam and thom.

The files are mono, trimmed to where the ring falls to silence, normalized,
and compressed. AAC in `.m4a` or MP3 decodes in every browser we target;
Ogg doesn't in older Safari. The sizes stay fairly small if we're careful (these are measured on the
dataset's takes, and our own recordings would ring longer):

| | Size |
|---|---|
| audio | 10 strokes × 4 takes × 6 tonics is 232 files and 97 s, measured on the dataset |
| download | about 1.2 MB at 96 kbps mono, loaded only when the mridangam is first turned on |
| memory | decoded PCM is about 190 KB/s mono at 48 kHz, so 3.1 MB for the pack nearest the tonic, 18.6 MB for all six |

That's three orders of magnitude under Mridangam Studio's 1.1 GB. The
container has no ffmpeg, so trimming and measuring can be a node script
(parsing WAV as the tests already do), and the encoding step runs on a
machine with ffmpeg.

### Patterns

The pattern library is text files under
`web/static/Resources/Mridangam/patterns/`, one file per tala family. User
patterns live in `localStorage`, like the thambura's settings, since there
is no server-side data. Sharing is a URL with the pattern's text in the
fragment (`#pattern=...`), so a teacher can send a student a link that plays,
which is the Tala Keeper idea and a natural fit for a web app.

## 4. Views

The mridangam shares the tala's Start and Stop, so its controls sit in the
tala player, not in a second floating bar like the thambura's.

- **A Mridangam panel** under the tala settings, collapsed until turned on:
  - an on/off switch
  - the pattern, "Auto" by default or picked from the library for the
    current tala and nadai
  - the speed (1st, 2nd, 3rd)
  - the variety (off, some, lots) and a fill every N cycles
  - a korvai button
  - the volume, with a left/right balance
  - the tuning, shown as "follows the thambura, C3 (1 kattai)", with a
    thoppi-pitch nudge
- **A stroke lane** under the beat image shows the current cycle's aksharas,
  with the pattern's strokes (and solkattu, when written) in each one, and the
  stroke being heard lit up. It's driven by `heardNow` cues, as the images
  are, so it lights with the sound and not when it was booked.
- **A stroke pad** draws the two drum heads as pads, one per stroke, each
  labelled with its name and where it's struck. Tapping one plays it at the
  current shruthi. It's the first thing to build, because it's how we check
  every sample and the tuning by ear, and it doubles as a way to learn the
  strokes.
- **A pattern editor** comes later. It's a grid of aksharas by slots with
  the anga marks drawn in, where tapping a slot picks a stroke from a palette (the My
  TalaVadyam tiles), plus a text mode for typing, audition of a single
  akshara, looping a section, and save and share.

## The order to build it in

Each step is a PR that works on its own.

1. **Strokes and tuning.** Done, but for the listening. The kit manifest and
   loader, `bend`, per-zone choke, a level per zone and the stroke pad are in
   the app; the measuring scripts and the kit itself are in the data repo.
   None of that code is about the mridangam: a kit declares its zones, its
   tunings and its strokes, so a ghatam or a tabla needs no new code.
   A kit is copied in with `make devkit` and isn't committed, so Go only
   writes `data-kit-url` when one is there, and a plain checkout shows no pad.
   What's left is the ear: every stroke at a few keys, next to the thambura.
2. **One pattern.** Done, but for the listening. `TalaGrid` says where the
   cycle's beats fall, `StrokeSequencer` plays a pattern against them on the
   tala's own tempo map, and one Adi pattern in chatusram is written out in
   `patterns.ts`, with a switch in the panel. Patterns are written per beat, so
   the same pattern serves Adi and a chatusra Thriputa and stretches with kalai.
   A tala with no pattern stays silent and the panel says so. The pattern itself
   still wants a player's eye (open question 3).
3. **The pattern format.** Parser, validation over the library, curated
   patterns for Adi, Rupakam and the Misra and Khanda chapus at two speeds,
   the generated fallback for the rest, and the stroke lane.
4. **Arrangements.** Variations, fills, korvai, eduppu and count-in,
   tempo-based choice.
5. **The editor**, local saving and share links.
6. **A shippable kit.** Our own recordings, or the dataset with permission,
   covering both drums. Maybe synthesized open strokes if the experiment
   works out.

## Open questions

1. **Samples.** Should we ask the dataset's authors for permission, record our
   own (and who plays?), or try synthesis first?
2. **Speeds.** In slots per akshara, what should 1st, 2nd and 3rd speed mean
   for each nadai, so the app matches how a teacher counts?
3. **Who checks the patterns?** The patterns, the stock phrases and the
   phrase-to-stroke mappings need a mridangam player to write or at least
   vet them. The same person could name the dataset's ten labels by ear,
   since `bheem` against `dheem` will confuse anyone reading a manifest.
4. **Where the controls live.** We've assumed the tala player's panel, since
   the mridangam shares the tala's Start and Stop. Would you rather it had its
   own floating bar, like the thambura?
