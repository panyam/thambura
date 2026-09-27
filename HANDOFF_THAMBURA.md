# Handoff: Thambura

Written 2026-09-27, late, after #101 (the track list) landed in five PRs and
the first production deploy since a78db12. It folds forward what's still
open from the earlier 2026-09-27 handoff and drops what closed: the #101
design question, the deploy, render speed (#39, #40), and #130. The durable
notes are in CLAUDE.md, NEXTSTEPS.md and `docs/designs/`; this file is only
what's in flight. Delete it once the items below close.

## Where things stand

- **The home page is the track list.** `/` is the tala across the top
  (image and transport left, the speed and shruthi strip and selects right
  from `lg` up, the island's `wide` config) and a full-width row per
  instrument under it (`TrackList`, `TrackListView.tsx`). A row's toggle
  opens its panel and Remove; the thambura's panel is its row's, and the
  drawer and floating Thambura button are gone. The floating button is
  Start all, Space starts or stops everything, T plays the thambura alone,
  and Shift+↑/↓ steps the page's shruthi (`Shruthi`, one per page, which
  the thambura and the kit follow). A new visitor starts with the claps and
  a thambura and adds the mridangam. The About text is on `/about`. The
  whole setup is one link (session, claps, thambura and kit parts).
  `docs/designs/instruments.md` ("Views") records the decisions.
- **The same layout is buildable from the public API.** The embed guide
  documents the `tracks` island and the tala's `wide` and
  `instrumentControls`, and #149 checked a track list embedded on a second
  origin. What stays ours on purpose: `main.ts`'s page keys, the floating
  Start all, the address-bar link, the service worker and Install.
- **Deployed:** thambura.com serves 3c4e21a (the track list on `/`, #142,
  and everything since a78db12, the mridangam kit included, so the dataset
  is public). Master is ahead by #148 and #149; dev serves #149's build,
  which is master's.
- **The lift into goapplib and tsappkit** is unchanged from the last
  handoff and still unstarted: goapplib#28 (`internal/page`, the Islands
  partial, labs/noindex helpers, tag `v0.2.0`) then goapplib#27
  (`web/src/page` into tsappkit `0.1.0`, with an entry point that takes a
  registry). Use a fresh goapplib clone (the `newstack/` one's `.git`
  points at a Mac path), and npm publish credentials here are unchecked.
- **The mridangam is still paused** (#77 to #82); its patterns live in the
  kit track, and its stroke lane is now in its row.

## Next on the instruments path

1. **Deploy #148 and #149** once the user has tried dev.
2. **#103, a second thambura**, labelled ready. Only one thambura can be
   added today (`TrackList` offers one while there's none); a second needs
   Add to offer it, its own link part and storage (ids already allow it),
   and `newThamburaPresenter` starting it fresh (only `thambura-1` inherits
   the pre-id record).
3. **#102, drawn pads** from a `layout` in `kit.json`, shown under the kit
   row's toggle where the pad is now.
4. **#99 with #104:** patterns naming their instrument, with the first
   ghatam or kanjira kit, which needs recordings first. A second copy of
   the same kit waits on this too: two copies would play the same pattern.
5. **#132, asset packs**, and **#144** (filed by another session: embeds
   save to the host's localStorage under our keys).

## Waiting on the user

0. **A name for the hands track** in place of "Claps" ("Visual" and
   "Position" were floated). Parked on 2026-09-27.
0. **Whether the embed guide should point at the published kit.** It still
   says no kit is published on thambura.com, which stopped being true with
   the 3c4e21a deploy.
0. **Whether to close #54** (where the thambura sits): the track list
   settled it, and NEXTSTEPS now says so.
1. **When to start the lift** (above), and whether #131's npm package and
   tsappkit's publish can share credentials.
2. **The wording and date of Evan Laforge's permission** for karya's
   patterns. `web/patterns/CREDITS.md` has a placeholder asking for it.
3. **Phone checks** on the live site, which headless Chromium can't do:
   iPhone Safari with the silent switch on, the address bar updating, Copy
   link and Share, and whether the screen stays awake through a long drone
   (the wake lock now follows the thambura from `buildContext`, not its
   island).
4. **A listen to the tala** against the images, and to the mridangam at the
   Variety odds ("some" varies about a third of cycles, "lots" seven in ten),
   now with the lane in the kit's row.
5. **Three sound questions** for the Lab: a louder second Sa (+1.2 dB
   against the recording's +2.8), a softer attack (20-30 ms against 7 ms),
   a shorter ring (the recording's harmonics fall about twice as fast).
6. **A recording of a real tanpura** (#47), iTablaPro's or any.
7. **Small decisions:** whether www.thambura.com should redirect to the
   bare domain, and whether to keep the dev container's IP (98.248.54.110)
   on the Namecheap API whitelist.
8. **Who vets the mridangam patterns.** All but the Adi one are karya's
   (converted by us, unverified) or generated; the Adi one is drafted.

## Open issues

- **Instruments (#94):** #99, #102, #103, #104, #132; #144 (embed storage).
- **Filed by other sessions:** #113 (pluck patterns beyond Pa Sa Sa Sa),
  #116 (the Lab beside any skin), #121 (a built-in sound's hidden values
  change old Custom links without the drift notice), #138 (a settings page
  for the pluck cache's size).
- **Mridangam, paused:** #77 fills, eduppu and a count-in; #78 a pattern to
  suit the tempo; #79 more patterns and replacing the drafted Adi one; #80
  arai chapu and the left-hand tha; #81 the lane on a long cycle; #82
  solkattu under the strokes.
- **#72, the AAC kit:** decided by attack onset in real Chrome and Safari,
  which Playwright's Chromium (no AAC) can't measure.
- **Thambura sound:** #8 umbrella; #51 a Hindustani-leaning preset; #45,
  #46, #47; #64 curves outrun a 3 s round; #52 pluck models.
- **Render speed #36:** #37 to #40 done; #41 (WebAssembly) a poor trade;
  #42 (an AudioWorklet) open.
- **#22, hand images**, blocked on what the three kriyas should look like.
- **Upstream, panyam/notations:** #17 to #22, filed earlier with
  reproductions; #19 and #21 shape how our pattern files are written.
- **Small follow-ups not filed:** the manifest's install screenshots and
  `og.png` still show the drawer-era layout (`design/render-images.mjs`
  regenerates them).

## Environment

- This session worked in worktrees under `thambura/` and removed each when
  its PR merged. Only `thambura/checkpoint-home` (this checkpoint's PR) is
  left; remove it once that lands. No servers of this session's are running.
- Other sessions hold 8001 and 8002; 8080 and 8091 are something else.
  Serve a worktree on a free port, restart it after every rebuild (a stale
  `bundle.json` shows as chunk 404s), and **check the port is free
  afterwards**: `fuser` isn't installed, so `fuser -k` silently does
  nothing. See CLAUDE.md, "Checking in a browser".
- A worktree needs the kit copied in for anything mridangam
  (`cp -r ../main/web/static/Resources/Kits web/static/Resources/`, or
  `make devkit`); `make deploy` and `make deploydev` upload whatever kit the
  worktree has.
- A box restart loses each worktree's `web/node_modules` and the shared
  `../.venv` (`make setupvenv` rebuilds it).
- `thambura/mridangam-data` is the `thambura-data` working copy (359 MB);
  the C recording is `thambura/01-Tanpura-Sample.mp3`, outside every
  checkout (copy it into a worktree's `recordings/` as `tambura-C.mp3` to
  rerun the sound analysis).
