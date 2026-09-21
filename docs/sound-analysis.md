# Tambura sound analysis

How the "Tambura" voice (mode `jawari`) was fitted to a recording of a real
tambura, with the tools to do it again. The recording was 60 s of a C
tambura. Nothing from it ships: the app still synthesizes every pluck (see
"Rendered samples" in [architecture.md](architecture.md)), and the recording
only served as the thing to measure against. Issue #8 tracks the sound work.

Everything here runs from the repo:

| Tool | What it does |
|---|---|
| `pnpm render-mix` (in `web/`) | Plays the app's thambura offline, through the real engine code, and writes a WAV plus a JSON of every pluck and damp. |
| `tools/sound-analysis/analyse.py` | Prints every measurement for one file, a recording or a render. |
| `tools/sound-analysis/features.py` | Writes those measurements to a feature file, the same shape for a recording and for a render. |
| `tools/sound-analysis/score.py` | Scores one feature file against another: one distance, and a line per feature saying what is out. |
| `tools/sound-analysis/tables.py` | Writes the tables on this page from the feature files, with no audio in reach. |
| `tools/sound-analysis/compare.py` | Measures the recording and the renders together and draws the charts on this page. |
| `tools/sound-analysis/fit.py` | Fits the jawari voice's bloom to a recording. |
| `tools/sound-analysis/soundlab.py` | The measurements themselves, shared by the three scripts. |
| The Lab view (in the app) | Every number of the plucked sound, string by string, to tune by ear. Exports JSON that `render-mix --custom` plays. |

## Setup

You need Python 3.10 or later and the web toolchain (`make ui` has already
installed it if you've built the app). The Python packages are numpy, scipy,
soundfile and matplotlib. soundfile wraps libsndfile, which reads WAV, FLAC,
OGG and MP3, so no ffmpeg is needed.

```sh
make setupvenv                  # from the repo root
source ../.venv/bin/activate    # then the commands below run as `python`
cd tools/sound-analysis
```

One venv at `../.venv` serves every worktree and the `thambura-data`
checkout, since they all sit beside each other. `make setupvenv` is safe to
rerun, `make -s venvpath` prints the path for a shell alias, and `VENV=...`
puts it somewhere else. Without activating, call it by path instead:
`../../.venv/bin/python analyse.py ...`.

The tested versions were Python 3.12, numpy 2.5, scipy 1.18, soundfile 0.14
and matplotlib 3.11. The tests come with pytest in the same file;
`make soundtest` from the repo root runs them in the same venv. They measure
synthetic strings whose ring, stiffness and buzz the test chose, so they need
neither a recording nor a render.

Recordings go in `recordings/` at the repo root, which is gitignored too:
they're someone else's audio and they're large. The one used here was
`recordings/tambura-C.mp3`.

## Running the analysis

**1. Find the tuning.** With no `--sa`, `analyse.py` lists the strongest
spectral peaks:

```sh
python analyse.py ../../recordings/tambura-C.mp3
```

For the C recording the top peaks were 131.05 Hz (Sa), 196.8 Hz, 261.7 Hz and
65.4 Hz (the low Sa). The first string is usually Pa an octave down. You can
confirm that from its odd harmonics, which fall between the Sa series: 295,
493, 690 and 887 Hz show up here, which is Pa at about 98.3 Hz.

**2. Measure the recording.**

```sh
python analyse.py ../../recordings/tambura-C.mp3 --sa 131.05
```

For a first string other than Pa, pass `--first` with the swara's ratio to
Sa, halved (Ma 0.667, Ni 0.9375). The output covers the pluck timing, how
much each pluck lifts the mix, the mix's level over a round, the first
string's and the low Sa's tables over time, and when each string is damped.

**3. Render the app's voices.**

```sh
cd ../../web
pnpm render-mix                          # jawari, tambura and guitar at C3, 5.8 s rounds, 30 s each
pnpm render-mix --modes jawari --key G3 --cycle 4.5 --tone 70
```

The files land in `recordings/renders/` as `<mode>.wav` and `<mode>.json`.
`render-mix` runs `mixThambura` (`web/src/tools/thamburaMix.ts`). That uses
the mode's plan (`planFor`), the presenter's own per-pluck options (`pluckOptions`), the sequencer, the
80 ms choke and the 0.2 s damp, so the mix plays like the browser does,
without the limiter. The render also makes a good listening copy. Pass
`--cycle` (seconds a round) to match a recording's speed; 5.8 s is the C
recording's, and the default.

**4. Measure a render.** `analyse.py` reads the JSON beside a WAV for the
pitches and pluck times, so no `--sa` is needed:

```sh
cd ../tools/sound-analysis
python analyse.py ../../recordings/renders/jawari.wav
```

**5. Compare them and draw the charts.**

```sh
python compare.py            # defaults: recordings/tambura-C.mp3 at Sa 131.05, recordings/renders
```

This writes the PNGs in `docs/images/sound-analysis/`. Re-run it after
changing a voice. It takes a few seconds.

**6. Measure them into feature files.**

```sh
python features.py ../../recordings/tambura-C.mp3 --sa 131.05 -o features/tambura-C.json
for m in jawari tambura guitar; do
  python features.py ../../recordings/renders/$m.wav -o features/$m.json
done
```

A feature file holds every measurement on this page, in the same shape whether
it came from a recording or a render. The files in `features/` are committed
and the audio isn't, so a feature file is how a measurement travels between
people and between commits. Re-run this after changing a voice and the diff
says what the change did.

**7. Score one against another.**

```sh
python score.py features/tambura-C.json features/jawari.json features/tambura.json features/guitar.json
```

```
jawari against tambura-C: 1.75   (0 is the same measurements; 1 is about one tolerance out)
  ✓ timing                        0.95   Sa 1 to Sa 2 -0.03 of the round
  ✓ string stops                  0.86   first -0.04 of the round
  ✓ pluck lift                    0.90   Sa 2 -1.57 dB
  ~ level over a round            1.75   0.75 of the round +4.80 dB
  ~ bloom                         1.51   first at 4 s +7.30 dB
  ~ brightness                    1.55   low Sa at 2 s -0.75 octaves
  ✗ string level                  2.72   first at 3 s +9.70 dB
  ✗ attack                        3.27   first +6.40 dB
  ✗ ring                          2.14   low Sa 2.14x
  ✗ buzz between the harmonics    8.25   low Sa -51.20 dB  (not in the total)
  ✓ inharmonicity                 0.06   first -0.35 cents
```

Every feature is divided by a tolerance before it counts, so a group's
distance reads as how many tolerances out it is and the total is the weighted
RMS over the groups. The weights and the tolerances sit in one table at the
top of `score.py`, each with a comment saying why it is what it is, and
arguing with them is what having them in one place is for. `--json` prints the
same numbers for a program to read, which is how #45 will drive a search.

**8. Write the tables on this page.**

```sh
python tables.py          # rewrites the generated blocks below
python tables.py --check  # exits 1 if the page has drifted
```

`tables.py` reads `features/` and nothing else, so the tables can be redone
from a clean checkout without any audio, and they can't drift from what the
tools measure.

**9. Refit, if you have a new recording.**

```sh
python fit.py ../../recordings/tambura-C.mp3 --sa 131.05
```

This takes about 40 s. It prints the fitted parameters and the model beside
the recording, band by band. "Fitting" below explains how its numbers turn
into `pluckVoice`.

**10. Tune by ear in the Lab, then measure.** Open the thambura bar, pick the
Lab view, choose a starting sound under "Start from" and press Load. That
copies the mode's plan into the Custom mode, which sounds the same until you
change something. Each string has its own tab (level, force, attack, ring,
bloom and so on), and the rhythm sliders set the gaps. The Sound switches to
Custom as soon as you touch anything. When it sounds right, press "Copy
settings" and save the JSON, say as `recordings/lab.json`, then:

```sh
cd ../../web
pnpm render-mix --custom ../recordings/lab.json     # writes recordings/renders/custom.wav
cd ../tools/sound-analysis
python features.py ../../recordings/renders/custom.wav -o features/custom.json
python score.py features/tambura-C.json features/custom.json
python compare.py                          # adds "Custom (Lab)" to the charts
```

For example, raising only the second Sa's level from 0.7 to 1.0 (+3 dB)
takes its pluck lift from +1.2 dB to +2.2 dB, against the recording's
+2.8 dB, and the score's pluck lift group moves with it. Delete
`recordings/renders/custom.*` and `features/custom.json` to take it out of the
charts and tables again. Pasting JSON into the Lab's "Settings JSON" box loads it back, so a
sound can travel both ways.

To share a sound with other listeners, send the page's address: the `?s=`
parameter carries the whole setup, the Custom plan included, and the bar's
link button copies it. Opening it plays the same sound in the same view.
Save sounds you like as presets (the Lab's Presets section, or the bar's
Presets menu). A preset's Share button opens a "Share a preset" issue on
GitHub with its link filled in, which is how good sounds from listeners can
become built-in presets.

## What the synth models, control by control

The words first, since they come from three different worlds.

**Jawari** is not an audio term. It is the instrument maker's word (also
*javari* or *jivari*, from *jiva*, "life") for the wide curved bridge of a
tanpura, sitar or veena, and for the craft of shaping it. A cotton thread
slid between string and bridge tunes it. Because the bridge is curved and
flat-topped, the vibrating string grazes it over and over, and each graze
feeds energy into higher partials. That is the shimmer, and it is why a
tanpura doesn't sound like a guitar. C. V. Raman studied it in the 1920s.

**Bloom** is our name, not a standard one, for the swell of those upper
partials after a pluck. The standard vocabulary: the **partials** are the
frequencies a string sounds at; the **spectral envelope** is how loud each
is; a **formant** is a bump in that envelope, a band that is emphasized. Our
bloom is a formant whose gain changes over time. The **spectral centroid**,
the energy-weighted mean frequency, is the usual one-number stand-in for
brightness, and it is what the charts above plot.

**Decay** is how a sound falls after its attack, said either as **T60**
(seconds to fall 60 dB) or as a time constant (the sound falls as
`e^(-t/tau)`). Real strings lose energy faster at high frequencies, so every
partial has its own decay.

With that, each Lab control:

| Control | What it stands for |
|---|---|
| Ring | The fundamental's T60. Longer string, heavier gauge, lower losses. |
| High decay | How much faster partial *k* decays than the fundamental (`1 + decay(k-1)`): mode-dependent damping from air, internal friction and losses into the bridge. |
| Rolloff | How steeply the partials fall off at the moment of the pluck. Higher is darker. |
| Pluck point | Where along the string it is plucked. It silences partials with a node there, which is comb filtering: at 10%, every 10th partial. |
| Harmonics | How many partials are rendered at all (never above 8-10 kHz). |
| Attack | How long the note takes to rise, 4-80 ms. Short is a plectrum, long is a finger. |
| Force | Extra high partials for the first 40 ms, as from a firmer pluck. |
| Scale by the attack | Whether the render is normalized to its attack or to its loudest moment, which decides whether a big bloom leaves the attack quiet. |
| Bloom, centre, width | The jawari's formant: how far it lifts, where it sits (Hz) and how wide it is (octaves). A bigger instrument blooms lower. |
| Bloom rise, hold, fall, rest | Its shape in time: it swells, holds, falls back, and leaves a little brightness behind. Most of what tells two instruments apart. |
| Bloom energy | Whether the lift adds loudness or only moves energy up the spectrum. A real jawari mostly moves it. |
| Detune | Cents off the key, which is what makes two strings beat against each other. |
| Level, Pan | Where the string sits in the mix. |
| Duration, the four gaps, Stop before next | The round: how fast, how the plucks are spaced, and how long before its next pluck the player's finger stops a string. A tanpura is often left to ring instead, which is this at 0. |

**The strings overlap.** A pluck never waits for the one before it. Each
string rings for many seconds (12-36 s for the tambura voices) while the
others are plucked every second or so, so three or four strings sound
together at any moment. A string is cut only by its own next pluck (an 80 ms
choke) or by that damp shortly before it. This is why a change to one string
can be hard to hear under the other three, and why the Lab has Solo.

**What it does not model**, which no amount of fitting will reach (#52):
inharmonicity (a stiff string's partials run sharp of exact multiples, which
is much of what separates steel from brass from gut), two-stage decay (a real
string trades energy between two planes of vibration, so notes often fall
fast then linger), the jawari's actual buzz (ours is a smooth band, not a
nonlinear rattle that follows how hard you pluck), contact and rattle noise,
sympathetic ringing between strings, the body's resonance, and any room or
microphone colour.

## How the measurements work

**One mono mix, four strings.** A recording is a mix of all four strings, so
each string is followed through the harmonics that only it has. The low Sa is
an octave below Sa, so every Sa harmonic is also an even harmonic of the low
Sa, and the Sa strings can't be followed on their own. The first string's
odd harmonics fall halfway between the low Sa's, 33 Hz from the nearest one
at C. The low Sa's odd harmonics that stay clear of the first string's work
the same way. `own_harmonics` keeps the ones at least 25 Hz from every
other string's harmonic. That leaves 36 for the first string and 35 for the
low Sa at C.

**Spectrogram.** An 8192-sample window (186 ms at 44.1 kHz), stepped every
10 ms. That resolves harmonics 5 Hz apart. The price is a smeared attack:
anything measured in the first 0.1 s after a pluck is blurred over about
0.1 s. Each harmonic's power is read from the three bins around its peak.
The peak is searched within ±0.8% of the expected frequency, because a real
string's upper harmonics run a little sharp, but never more than ±10 Hz, so
the search can't reach a neighbouring string.

**Finding the plucks.** Renders list theirs in the JSON. In a recording:

- The first string and the low Sa: their own harmonics jump 25-40 dB within
  0.12 s. Rises over 10 dB count.
- The first Sa: the most prominent rise in the Sa harmonics that the first
  string doesn't share (Pa's 4th harmonic is Sa's 3rd). The search runs
  between a first-string pluck and the next low Sa.
- The second Sa: it's tuned to the first Sa, which is still ringing, so it
  hardly shows in the Sa harmonics. It shows as a rise across the whole
  spectrum, 60 Hz-5 kHz, between the first Sa and the low Sa.

Plucks in the first and last 6 s are dropped, since the recording fades in
and out there.

**What's measured, per string.** Each is averaged over the plucks, relative
to the string's own pluck:

- *level*: the power in its harmonics, in dB below its loudest moment.
- *1-2.5 kHz share*: the power in its harmonics between 1 and 2.5 kHz, in
  dB relative to all of them. This is where the jawari's bloom shows.
- *centroid*: the power-weighted mean frequency of its harmonics, a single
  number for brightness.
- *bands*: the power in seven frequency bands (0-250 Hz up to 4-7 kHz).
  `fit.py` fits these.
- *damp lead*: the steepest 0.3 s fall in its harmonics, measured from 3 s
  after the pluck, as seconds before its next pluck.
- *T60 per harmonic*: how long each harmonic would take to fall 60 dB, from a
  line through its dB curve over 2-4.5 s after the pluck, or less when the
  round is shorter. The window opens after the bloom has swelled and fallen
  back, so what it measures is the ring. Nothing falls 60 dB inside it, so
  every T60 is an extrapolation from a few dB, and in a recording, where the
  strings beat against each other, neighbouring harmonics can differ twofold.
  Read the median.
- *inharmonicity*: how far the upper harmonics run sharp of exact multiples,
  as the stiffness B in `f_k = k f0 sqrt(1 + B k²)`, and as how sharp harmonic
  20 runs in cents. Each peak is read from a 2 s window after the pluck and
  placed between bins by a parabola; the fit runs over a widening range of
  harmonics, each pass aiming the next search, since a stiff string's harmonic
  30 can sit further from 30 f0 than one search reaches. A peak less than
  15 dB above what surrounds it is skipped: reading one out of the noise moves
  the fit further than leaving a harmonic out. The fitted f0 also says how the
  string was tuned, which in a recording is the player rather than the string.
- *between the harmonics*: the power midway between the harmonics against the
  power at them, per bin. This takes its own spectrogram, with a
  Blackman-Harris window whose sidelobes are 92 dB down, because the default
  window would fill the gaps with the harmonics themselves. It is where the
  jawari's buzz lives, and where a sum of sines has nothing.

**What's measured on the whole mix.**

- *level over a round*: RMS in 0.25 s steps from each first-string pluck,
  averaged over rounds.
- *pluck lift*: the loudest 30 ms in the 0.2 s after a pluck, against the
  0.23 s before it. This is how much a pluck stands out.
- *A-weighted*: both of those again through an A-weighting filter, which
  counts the bloom's band for about as much as the ear does and the
  fundamental for much less. A drone that measures level can still swell.

## Results

The recording against the three plucked voices at C3, all at the
recording's 5.8 s round. The guitar is a different instrument: it's in the
tables and the round chart but not the per-string charts. Its strings fade
40-60 dB, low enough that the other strings' plucks leak into the
measurement.

### Timing

![When each string is plucked](images/sound-analysis/pluck-timing.png)

<!-- generated: timing -->
| When each string is plucked (share of the round) | Recording | Tambura (new) | Tambura (classic) | Guitar |
|---|---|---|---|---|
| Sa 1, after the first string | 0.288 ±0.012 | 0.298 ±0.001 | 0.198 ±0.001 | 0.198 ±0.001 |
| Sa 2, after the first string | 0.524 ±0.022 | 0.504 ±0.001 | 0.399 ±0.001 | 0.399 ±0.001 |
| low Sa, after the first string | 0.708 ±0.022 | 0.709 ±0.001 | 0.599 ±0.001 | 0.599 ±0.001 |
| first: stopped before its next pluck (s) | 0.63 | 0.39 | rings on | rings on |
| low Sa: stopped before its next pluck (s) | 0.96 | 0.82 | rings on | rings on |
<!-- /generated -->

The player spaced the plucks unevenly: a long gap after the first string, a
shorter one between the Sa strings, the shortest before the low Sa, then a
long one back to the first string (0.288, 0.236, 0.184 and 0.292 of the
round). The classic voice uses five equal slots with a rest after the low Sa,
like an electronic tambura. The new voice uses `PLAYED_PATTERN`: 0.30 after
the first string and 0.29 after the low Sa, as measured, but the two Sa
strings share the time between evenly (0.205 each). With the recording's
spacing, the first Sa's note lasted about 1.4 times the second's, and by ear
that stood out more than it helped.

The player also stopped each string before plucking it again: the first
string 0.63 s before (median; 0.34-0.93), the low Sa 0.96 s before
(0.23-1.11). The new voice damps them 0.52 s and 0.93 s ahead at a 5.8 s
round (9% and 16% of the round). The analysis reads those as 0.39 and 0.82,
because the fade starts at the damp and runs 0.2 s. The classic voice lets
every string ring into its own next pluck.

### The bloom

![The jawari bloom](images/sound-analysis/bloom.png)

![Brightness over a pluck](images/sound-analysis/centroid.png)

<!-- generated: bloom-first -->
| First string (Pa), seconds after its pluck | 0.05 | 0.4 | 1 | 1.3 | 1.6 | 2 | 2.5 | 3 | 4 |
|---|---|---|---|---|---|---|---|---|---|
| 1-2.5 kHz share (dB), Recording | -19 | -2 | -2 | -2 | -1 | -8 | -13 | -17 | -19 |
| 1-2.5 kHz share (dB), Tambura (new) | -17 | -5 | -2 | -2 | -2 | -6 | -11 | -12 | -12 |
| 1-2.5 kHz share (dB), Tambura (classic) | -17 | -14 | -13 | -12 | -11 | -11 | -12 | -12 | -9 |
| 1-2.5 kHz share (dB), Guitar | -11 | -15 | -25 | -31 | -37 | -45 | -39 | -46 | -44 |
| centroid (Hz), Recording | 175 | 1130 | 1064 | 1378 | 1334 | 683 | 540 | 449 | 354 |
| centroid (Hz), Tambura (new) | 220 | 725 | 1105 | 1145 | 1115 | 694 | 370 | 344 | 338 |
| centroid (Hz), Tambura (classic) | 395 | 550 | 590 | 601 | 582 | 545 | 510 | 475 | 471 |
| centroid (Hz), Guitar | 333 | 214 | 170 | 169 | 169 | 162 | 147 | 132 | 115 |
| level (dB re its loudest), Recording | -9 | -10 | -5 | -0 | -3 | -12 | -15 | -17 | -17 |
| level (dB re its loudest), Tambura (new) | -2 | -2 | -0 | -0 | -1 | -5 | -6 | -7 | -9 |
| level (dB re its loudest), Tambura (classic) | -0 | -0 | -1 | -2 | -2 | -4 | -5 | -6 | -8 |
| level (dB re its loudest), Guitar | 0 | -4 | -11 | -14 | -17 | -20 | -24 | -28 | -38 |
<!-- /generated -->

<!-- generated: bloom-low-sa -->
| Low Sa, seconds after its pluck | 0.05 | 0.4 | 1 | 1.3 | 1.6 | 2 | 2.5 | 3 | 4 |
|---|---|---|---|---|---|---|---|---|---|
| 1-2.5 kHz share (dB), Recording | -28 | -18 | -9 | -8 | -8 | -17 | -19 | -21 | -21 |
| 1-2.5 kHz share (dB), Tambura (new) | -24 | -15 | -10 | -9 | -10 | -16 | -20 | -21 | -21 |
| 1-2.5 kHz share (dB), Tambura (classic) | -12 | -10 | -9 | -9 | -9 | -10 | -10 | -11 | -9 |
| 1-2.5 kHz share (dB), Guitar | -17 | -29 | -45 | -52 | -58 | -67 | -44 | -54 | -55 |
| centroid (Hz), Recording | 79 | 153 | 432 | 470 | 471 | 300 | 409 | 339 | 187 |
| centroid (Hz), Tambura (new) | 106 | 189 | 349 | 394 | 358 | 178 | 128 | 123 | 121 |
| centroid (Hz), Tambura (classic) | 250 | 371 | 382 | 376 | 361 | 341 | 316 | 296 | 311 |
| centroid (Hz), Guitar | 181 | 118 | 94 | 94 | 93 | 85 | 76 | 70 | 66 |
| level (dB re its loudest), Recording | -3 | -1 | -1 | -2 | -3 | -5 | -7 | -8 | -10 |
| level (dB re its loudest), Tambura (new) | -0 | -1 | -2 | -2 | -3 | -3 | -4 | -5 | -7 |
| level (dB re its loudest), Tambura (classic) | -0 | -0 | -1 | -2 | -2 | -3 | -5 | -6 | -8 |
| level (dB re its loudest), Guitar | 0 | -4 | -11 | -14 | -16 | -20 | -24 | -28 | -37 |
<!-- /generated -->

A real pluck starts dark: the first string's centroid is under 200 Hz at
the attack. Within half a second the 1-2.5 kHz band climbs about 17 dB, to
roughly half the string's power, and the centroid passes 1 kHz. It holds
until about 1.6 s, then falls back within the next second. That swell is the
jawari: the string grazes the curved bridge, and energy moves from the low
harmonics up into a band around 1-2 kHz. It's in the same place in Hz for
the first string and the low Sa, which is why the new voice sets it in Hz
(`formantHz`) rather than in harmonic numbers. The low Sa's rises to about
−8 dB, against the first string's −2 dB, so the new voice gives the low Sa
about half the depth.

The classic voice's resonance sweep stays at the same brightness for the
whole ring. The guitar starts brighter and dulls, as a plucked guitar string
does.

The recording's low-Sa centroid after 2 s jumps around, 300-400 Hz. That's
the first string's next pluck, 1.7 s after the low Sa, leaking in at a
level where the low Sa is quiet. Treat it as noise.

### Loudness

![Each string's loudness over a pluck](images/sound-analysis/string-level.png)

![The mix's loudness over one round](images/sound-analysis/round-level.png)

![How much each pluck lifts the whole mix](images/sound-analysis/pluck-lift.png)

<!-- generated: loudness -->
| The whole mix | Recording | Tambura (new) | Tambura (classic) | Guitar |
|---|---|---|---|---|
| level range over a round (dB) | 5.6 | 3.8 | 4.2 | 20.6 |
| level range, A-weighted (dB) | 8.4 | 6.5 | 4.1 | 29.2 |
| first pluck lift (dB) | +2.8 | +2.1 | +2.0 | +21.3 |
| first pluck lift, A-weighted (dB) | +1.0 | +0.6 | +2.3 | +30.3 |
| Sa 1 pluck lift (dB) | +0.8 | +0.5 | +2.3 | +12.8 |
| Sa 1 pluck lift, A-weighted (dB) | -1.1 | -1.2 | +1.9 | +18.2 |
| Sa 2 pluck lift (dB) | +2.8 | +1.2 | +2.4 | +13.9 |
| Sa 2 pluck lift, A-weighted (dB) | +0.9 | +1.0 | +1.7 | +17.2 |
| low Sa pluck lift (dB) | +1.6 | +2.1 | +2.6 | +11.3 |
| low Sa pluck lift, A-weighted (dB) | +0.1 | +0.9 | +0.7 | +12.3 |
<!-- /generated -->

A tambura is a drone: over a round the recording's level moves about 6 dB,
and each pluck lifts the mix by only 1-3 dB. The first string's level chart
shows it about 10 dB louder at its bloom than at its attack, but that is
only its odd harmonics, the ones that brighten. The whole mix barely swells.

The A-weighted rows are the same measurements heard rather than counted. The
recording's round swings 8.4 dB that way against 5.6 dB flat, since the bloom
sits where hearing is sharpest; the new voice swings 6.5 against 3.8. The
classic voice swings about as much either way, its brightness being the same
all through.

### Texture

<!-- generated: texture -->
| Texture | Recording | Tambura (new) | Tambura (classic) | Guitar |
|---|---|---|---|---|
| first: T60 of its harmonics, median (s) | 11.3 | 23.3 | 11.8 | 3.9 |
| low Sa: T60 of its harmonics, median (s) | 9.6 | 20.5 | 11.6 | 3.9 |
| first: between the harmonics (dB re the harmonics) | -21 | -68 | -59 | -64 |
| low Sa: between the harmonics (dB re the harmonics) | -18 | -69 | -60 | -84 |
| first: harmonic 20 sharp by (cents) | 0.37 | 0.02 | 0.02 | 0.27 |
| low Sa: harmonic 20 sharp by (cents) | 0.18 | 0.01 | 0.01 | 0.20 |
<!-- /generated -->

The recording's harmonics fall roughly twice as fast as the new voice's: a
median T60 of 11.3 s against 23.3 s on the first string, 9.6 against 20.5 on
the low Sa. The recording's harmonics beat against each other and neighbours
differ twofold, which is why the median is what gets compared, and the gap
between the two columns is wider than that scatter. The level rows say it
another way: 3 s after a pluck the render's first string is still 9.7 dB
nearer its own loudest moment than the recording's is.

Between the harmonics the recording carries -21 dB and -18 dB of what the
harmonics carry. Every render is 40 to 50 dB below that, at the measurement's
own floor, because a sum of sines puts nothing in the gaps. That gap is the
jawari's rattle, and no setting in the Lab reaches it (#52). `score.py`
prints it and keeps it out of the total, since it would add the same amount
to every render and bury what tuning can change.

Stiffness turns out not to be part of the difference. The recording's
harmonic 20 runs 0.2 to 0.4 cents sharp, a B of about 1e-6, so a tambura's
strings are close enough to ideal that our exact harmonics are right. The
fitted pitches are worth more than the stiffness here: the first string sits
4 cents above a just Pa and the low Sa 3 cents above the octave below Sa,
measured half a second after each pluck, where a string still rings a little
sharp of where it settles.

### The score

`score.py` puts the new voice at 1.75 against the recording, the classic
voice at 3.19 and the guitar at 9.36. The breakdown in step 7 says where the
new voice's 1.75 comes from: timing, string stops and pluck lift are inside
a tolerance, the bloom and the brightness within two, and three groups are
out. They are the attack (3.27), the ring (2.14) and the string level (2.72),
which are the two things "What's still open" below already listed by ear,
plus the ring the tables above just added.

### One round

![One round of each, 0-3 kHz](images/sound-analysis/spectrograms.png)

The spectrograms show the plucks' character. In the recording a pluck
brightens the low harmonics and the bloom fills in over a second, with no
vertical edge. The renders show a thin line through every frequency at each
pluck. The synthesized attack rises in 4-10 ms, and that fast rise puts
energy between the harmonics. The guitar's plucks are plain to see, and its
strings die away between them.

## Fitting

`fit.py` fits a simplified model of the jawari voice to the recording's band
tables (seven bands, 0.1-4.5 s after each pluck) for the first string and
the low Sa, by differential evolution. The model computes each harmonic's
amplitude directly rather than rendering audio, so a fit takes seconds. Its
equations are at the top of the script.

Every fit tried, with different parameters free, ended 5-6 dB RMS from the
recording. That's about the noise in the recording's own tables: six rounds,
and a mix where every string beats against the others. Several parameters
end up at their bounds (the bloom's depth and width), so the fit only
narrows the region. The values in `pluckVoice` were then picked by hand
inside that region, by comparing the cleaner whole-string measures above
(level, 1-2.5 kHz share and centroid over time):

| | Fitted (`fit.py`) | `pluckVoice` (tone 50, pluck 50, sustain 60) |
|---|---|---|
| rolloff | 1.06 | 1.5 |
| ring (s to −60 dB) | 54 | 36 |
| bloom centre (Hz) | 1250 | 1300 |
| bloom width (octaves) | 1.5 (bound) | 1.2 |
| bloom depth (dB), first string / low Sa | 40 (bound) / 28 | 42 / 22 |
| rise, hold, fall (s) | 1.09, 1.33, 0.61 | 0.5, 1.4, 0.6 |
| rest (share of the peak left after the fall) | (not in the model) | 0.3 |

Two changes came from listening rather than from the fit. The first version
normalized each string's render to its peak. A string with a big bloom has
its peak 1.4 s in, so its attack came out about 15 dB quieter than the low
Sa's, whose attack is its peak. The first Sa's pluck vanished under Pa's
fading bloom, and the low Sa's stood out by +6 dB. Two settings fixed it:

- `attackLevel` scales each render by the RMS of its first 0.1 s, so every
  string is plucked equally hard.
- `formantEnergy` 0.3: the bloom mostly moves energy up rather than adding
  it, as a jawari does. The first version's bloom added it all, and the mix
  swung 14 dB over a round.

## What's still open

- **One recording, one key.** At other keys the bloom stays around 1.3 kHz,
  so it covers different harmonic numbers. That's physically plausible, but
  a recording in another key would settle it.
- **The second Sa pluck is quieter than the recording's** (+1.2 dB against
  +2.8 dB). It lands while the first Sa, at the same pitch, is blooming.
  The player may pluck it harder, or the pair may be tuned further apart
  than our 1.5 cents.
- **The attack is sharper than the recording's.** The synthesized pluck rises
  in 4-10 ms. The recording's plucks look softer and slower in the
  spectrogram, and the score's attack group is the new voice's worst at 3.27:
  0.05 s in, the render is 6.4 dB closer to its own loudest moment than the
  recording is.
- **The strings ring about twice as long as the recording's**, 23.3 s against
  11.3 s as a median T60 on the first string. A shorter ring would also close
  most of the string level group, which is the render sitting 9.7 dB nearer
  its loudest moment 3 s after a pluck.
- **No buzz at all.** Between the harmonics the recording carries -21 dB of
  what the harmonics carry and every render is 40 to 50 dB below that. This
  one is the model rather than its settings (#52).
- **Tuning.** The recording's low Sa is about 3 cents flat of the octave
  below Sa. The first Sa should stand out more against the low Sa's octave
  harmonic when they differ like that. Trying it didn't change the measured
  pluck lift, so the voice leaves it out.

The Lab view is the place to try these by ear, with `render-mix --custom`,
`features.py` and `score.py` saying whether a change helped and
`compare.py` redrawing the charts. Fitting the parameters to the score
automatically is #45, and what the model can't reach whatever the parameters
is #46 and #52.
