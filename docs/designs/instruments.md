# Instruments and the mixer

Where the app is heading: a mixer of instruments, driven by one clock. You
pick a shruthi and a tala, then add what you want to practise against. Two
thamburas, a mridangam, a ghatam, a kanjira, a set of drums, the hand claps.
Each has its own level, and the tala keeper is the timer they all follow
rather than a player in its own right.

`architecture.md` is how the app works today. This is the shape it grows
into, and what each step costs.

## Where we already are

Rather more of this exists already than the names suggest.

- **The clock is built.** `TempoMap` plus `Transport` is a shared musical
  timeline: voices emit events at exact positions and the map turns those
  into audio seconds. A tempo change lands past the look-ahead horizon, at
  the same instant for every voice. That is the mixer's spine, and the tala
  and a mridangam sharing it is already tested.
- **Struck instruments are already generic.** `engine/kit.ts` knows about
  zones, packs and strokes, not about mridangams. A ghatam or a tabla is a
  different `kit.json`, not different code.
- **The mixer has tracks** (#96): a track id makes its own level, mute,
  solo and pan on first use, into a master gain and a limiter.
- **A kit is a track** (#97). It plays on its own id, runs its own
  `StrokeSequencer` on the page's transport, and follows the cycle the tala
  publishes on `clock.tala`, including where it resumes after a stop. Ids
  are `<kind>-<n>`, numbered in the order the page spec lists its
  instruments, so the first kit is `kit-1`.

- **The claps are a track** (#98). The tala calls each tick's sound on
  `clock.ticks`, and a hands track (`hands-1`) plays it from the chosen
  sound group, with its own level. The tala makes no sound at all.

## The shape

```mermaid
flowchart LR
  clock["Clock<br/>tempo map + transport"] --> t1["Track: hands<br/>(kit)"]
  clock --> t2["Track: mridangam<br/>(kit + patterns)"]
  clock --> t3["Track: ghatam<br/>(kit + patterns)"]
  free["Free-running"] --> t4["Track: thambura 1<br/>(synth)"]
  free --> t5["Track: thambura 2<br/>(synth)"]
  clock --> anim["Beat images<br/>(no sound)"]
  t1 --> mix["Mixer: level, pan, mute, solo"]
  t2 --> mix
  t3 --> mix
  t4 --> mix
  t5 --> mix
  mix --> master["master gain → limiter → speakers"]
```

**A track is one instrument playing.** It has a source, a level, a pan, mute
and solo, and a panel of its own. Two tracks can hold the same instrument,
which is what makes two thamburas possible.

**Sources come in two kinds.** A *kit* plays recordings (mridangam, ghatam,
kanjira, hands). A *synth* renders its own sound (the thambura today, and
whatever the pluck-model work in issue #52 brings). The mixer doesn't care
which.

**Tracks follow one of two clocks**, and this is the distinction worth
naming rather than treating as an exception:

- **Metrical tracks** run on the tala's tempo map. A stroke at akshara 3 of
  cycle 2 is at a fixed musical position, so every metrical track stays in
  step through a tempo change.
- **Free-running tracks** have their own speed. A thambura's round is 2 to
  8 seconds and has nothing to do with the tala's tempo. Its plucks, and the
  sruti drone's continuous tones, are free.

**The tala keeper stops being a player.** Today `PlayerPresenter` resolves
clap sounds from the fixture's groups and schedules them itself. It becomes:

- the **clock**, which it already owns,
- a **beat grid** (which cycle, which akshara, which anga) that anything can
  read, which the mridangam needs anyway for eduppu and korvai,
- a **hands track**, whose sounds are the claps, the finger counts and the
  waves. It stayed a fixture of sound groups rather than a kit (#98): the
  tala decides which sound each tick is, and Previous/Next play one beat
  at once, which a kit's own sequencer can't,
- the **beat images**, which are a consumer of the clock and make no sound.

Nothing about that changes what a student sees today. It's the same claps, on
the same grid, with the sound moved out of the timer.

## What has to change

| Piece | Today | Becomes |
|---|---|---|
| Buses | ~~three fixed names~~ | one per track, made on first use (done, #96) |
| `AudioOut` | ~~`setBusVolume(bus, percent)`~~ | `setLevel`, `setPan`, `setMute`, `setSolo`, `removeTrack` per track (done, #96) |
| Tala sounds | ~~the player schedules them from fixture groups~~ | a hands track playing the tala's calls (done, #98) |
| Beat grid | ~~inside `PlayerPresenter`~~ | `TalaGrid` on `clock.tala`, read by any track (done, #97) |
| Thambura | one presenter, one localStorage key, one `?s=` link | an instrument on the page with an id, `thambura-1`, its own track and key, and a part of the page link (done, #100) |
| Views | a page with a player and a floating bar | a track list, each track with its own panel |

The thambura row is the expensive one, as far as we can tell. Its settings, its presets and its
share links all assume there is exactly one. A second one means ids in the
saved state and in the link format, and the link format is the part people
have already got copies of, so it needs to stay readable when it carries one
track.

**Multi-instance, limited to one for now.** We'd rather the data model and the
presenters took an instance id from the start, and the UI offers a second thambura only
once it's cheap enough to add. That way the format work happens once, and the
limit moves when the numbers say it can.

**What "cheap enough" means.** A cold Start renders four strings in about
300 ms on a fast desktop, and that render is already the slowest thing in the
app. A second thambura doubles it. The issues to finish first are #38 (four
harmonics per loop), #39 (Web Workers, strings in parallel) and #40 (an
IndexedDB cache between visits). With a cache, a second thambura at a pitch
you've used before costs almost nothing. So: benchmark first (#37), then
allow the second instance when the numbers land, rather than because the UI
is ready.

## The pads: drawn per instrument

The stroke pad is a fallback grid today: buttons grouped by zone. Each
instrument should be able to draw itself instead, with the strokes where they
actually are. Two heads for a mridangam, the dayan and bayan for a tabla, one
pot for a ghatam with the bass near the mouth, several pieces for a drum kit.

That belongs in the manifest, next to the zones, as an optional `layout` with
a view box, a shape per zone and a spot per stroke. The pad draws the shapes,
puts each stroke's spot on its zone, and keeps the grid for any kit that
declares no layout. Nothing about it is instrument-specific in the code, and
an old kit keeps working, which is why it can wait until after the strokes
are playing.

A layout also gives the sequencer something to show: the spot lights when its
stroke is heard, which is how you see what a phrase is doing.

## Views: what the page shares, and what a track shows

Decided on 2026-09-27 for #101, and built in three PRs: the session strip
(#136), the track list, tried on `/labs/tracks` (#139), then the list on `/`
in place of the drawer, with the new-user defaults.

**Speed and shruthi belong to the page, not to an instrument.** Tempo
already did: the tala sets the clock's `TempoMap`, and a kit plays on it.
The shruthi was the thambura's until now, handed to the kit in Hz. It's
now a page service (`Shruthi` in `pageContext.ts`) holding the key, fine
tune and A4. The thambura plays to it and moves it when its own key
changes. A kit follows it. The session strip shows it and changes it. So a
change anywhere is heard everywhere, and a page with no thambura still
tunes its drum. Different shruthis for different instruments aren't
planned. A thambura preset keeps the page's shruthi, since a preset is a
sound, not a pitch.

**The session strip** (`SessionStrip.tsx`, driven by `session.ts`) sits
under the beat image. It holds the speed, with − and + around a slider, and
the shruthi as iTanpura shows it: the note in a display between semitone
arrows, and a fine tune between ♭ and ♯. Tapping the note opens all 15
keys, each with its kattai name, and a dot where a kit on the page would
sound stretched. The strip also has Start all, which starts the tala and
the thambura together, or stops everything if anything is playing. On our
pages, Space does the same and Shift+↑/↓ steps the shruthi. It's its own
island too (`session`), for a page whose tala doesn't carry it.

**The whole setup is one link.** A `session-1` part (see the share-link
reference) carries the tala, speed and shruthi, and the claps and each kit
have parts of their own beside the thambura's. On a page with a track list,
the parts present are the list, so opening a link gives the page that was
shared.

**The track list** (`trackList.ts`, `TrackListView.tsx`, on
`/labs/tracks`), as built:

- **The track list**, on a labs page first. Each instrument is a row. Collapsed, a row shows a
  status dot, its name, one or two quick controls (thambura: first string
  and sound; mridangam: Variety and Korvai; claps: sound group), start/stop,
  level, mute and solo. Expanded, it shows that instrument's own panel.
  Pan goes in the expanded view. Phones get a single column. From `lg` up
  the tracks sit in a grid of 2-3 cards, each showing its main controls,
  with an "Open full" button for the complete panel. Add offers only what
  can be added: the kits found, and a thambura while there's none (a
  second waits on #103). Removing an instrument clears its storage, so
  adding it back starts fresh, with a few seconds of Undo. The claps can't be
  removed while there's a tala; mute them. On the tracks page the claps'
  and the kit's controls are in their cards, not under the tala, but the
  stroke lane stays under the image. The desktop layout keeps the tala in a
  left column and the cards beside it.

**On `/`**, the list replaced the drawer and the floating Thambura button:
the thambura's panel is its card's "More", whose header leaves out the play
button and Sound menu the card already has. The floating play button stays
as Start all, and T plays the thambura alone on every page. A new visitor
starts with the claps and a thambura, and adds the mridangam from the list;
the list is saved only once they change it, so a better default still
reaches anyone who never did. A page without the list (`/labs/side-by-side`,
embeds) starts with every instrument the spec offers, the first kit
included, since it has no way to add one.

## The order

Each step stands on its own, and the early ones are already in the mridangam
plan (`mridangam.md`).

1. **The mridangam through step 3** of its own plan: the stroke sequencer on
   the tala's clock, the pattern format, a library of patterns. This is the
   first metrical track, and it proves the clock carries someone else's
   events.
2. **`TalaGrid`**, needed by that sequencer anyway, which is what lets a
   track ask where it is in the cycle.
3. **Tracks and the mixer**: a bus per track, level, pan, mute and solo, and
   a track list in the view. The thambura and the mridangam move onto it
   unchanged.
4. **The hands become a track**, and the tala keeper becomes the clock, the
   grid and the images. The fixture's sound groups become a hands kit.
5. **Instance ids** through the thambura's settings, presets and share links,
   still limited to one thambura. Done in two parts: the thambura as an
   instrument with an id, its own audio track and storage key (#100a), then
   a link format that carries several instruments (#100b).
6. **Drawn pads** from a manifest layout.
7. **A second thambura**, once the render numbers allow it.
8. **More instruments as kits**: ghatam, kanjira, a drum kit. By then adding
   one is a recording session and a manifest, not code.

## Several talas at once, later

Some practice plays two or three talas against each other and watches them
meet again after some number of cycles. Talas stay their own group, the
conductors, rather than becoming instruments: `clock.tala` would become a
set of talas keyed by id on one tempo map and transport, each instrument
following one of them, and each tick carrying which tala called it. A tala
only becomes an instrument if it has to follow something, such as one tala
defined in another's counts. Nothing is built for this yet; the rule for now
is not to add code that assumes there can only ever be one tala.

## What this doesn't change

- The app stays static, with no server-side data. Tracks, their settings and
  their patterns live in the browser and travel in links.
- One `AudioContext`, one limiter, one look-ahead scheduler. A mixer is more
  gains on the graph we already have, not a second engine.
- Practice comes first, as it has so far. A track list is worth having when it helps someone
  practise against a mridangam and a drone at once, not because a mixer is a
  nice thing to build.
