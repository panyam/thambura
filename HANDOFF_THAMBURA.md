# Handoff: Thambura

Written 2026-09-28, after the render work (#39 in #137, #40 in #140) and a
second thambura (#103 in #156). It folds forward what's still open from the
2026-09-27 handoff and drops what closed: #103, the #148/#149 deploy, #54,
and the embed guide's kit example (#154). The durable notes are in
CLAUDE.md, NEXTSTEPS.md and `docs/designs/`; this file is only what's in
flight. Delete it once the items below close.

## Where things stand

- **Renders are off the main thread and cached.** Plucks render on a pool
  of up to four workers (`pluckRenderer.ts`), the strings in parallel, and
  a change cancels any render it made useless within a slice. Rendered
  plucks stay in IndexedDB (`pluckCache.ts`, 60 MB, least recently used
  out), keyed on `RENDER_VERSION` plus every value that shapes a pluck. A
  cold Start's first pluck is about 70 ms (210 before), a returning
  visit's about 23 ms with no render at all. #36's plan is done bar the
  spikes #41 (WebAssembly, a poor trade) and #42 (an AudioWorklet).
- **A page can have two thamburas**, as iTanpura plays two. Add offers a
  second while there's one; `thamburaInstance` starts it on Ma, panned
  right (0.4), with its own render seeds. Start all and T start both, the
  second half its round behind. Both share one renderer. Sample keys now
  start with the thambura's id, which fixed a bug that only two could hit
  (one dropping a sample silenced the other's plucks).
- **Deployed:** thambura.com serves 6f5c85e (#151, checked 2026-09-28),
  which has the track list rows (#148, #149) and the render work. Not
  live: #156 (a second thambura) and the docs PRs after it (#152, #154).
  Dev serves 7f50acb (#149's branch). `make deploydev` then `make deploy`
  when the user wants #156 out.
- **Docs (#95)** on GitHub Pages were published from 6f5c85e, so the
  embed guide's live mridangam example (#154) isn't there yet. `make
  ghpages` from `origin/master` republishes.
- **The lift into goapplib and tsappkit** is unchanged and unstarted:
  goapplib#28 (`internal/page`, the Islands partial, labs/noindex helpers,
  tag `v0.2.0`), then goapplib#27 (`web/src/page` into tsappkit `0.1.0`,
  with an entry point that takes a registry). Use a fresh goapplib clone
  (the `newstack/` one's `.git` points at a Mac path); npm publish
  credentials here are unchecked.
- **The mridangam is still paused** (#77 to #82).

## Next on the instruments path

1. **#102, drawn pads** from a `layout` in `kit.json`, under the kit row's
   toggle where the pad is now.
2. **#99 with #104:** patterns naming their instrument, with the first
   ghatam or kanjira kit, which needs recordings first. A second copy of
   the same kit waits on this too, since two would play the same pattern.
3. **#132, asset packs**, and **#144** (embeds save to the host's
   localStorage under our keys).
4. **#138, a settings page for the pluck cache** (its size, Clear, usage).
   Filed this session; it should count both thamburas' entries.

## Small follow-ups from #103, not filed

- A pan control per thambura, as iTanpura has one per tanpura. The second's
  0.4 is fixed and unsaved today.
- The docked `thambura` island (`/labs/side-by-side`, embeds) always shows
  `thambura-1`.
- The T key's hint and `#play-all`'s title still say "the thambura".

## Waiting on the user

0. **Whether to deploy #156** (a second thambura) to thambura.com, after
   a look on dev.
0. **A name for the hands track** in place of "Claps" ("Visual" and
   "Position" were floated). Parked on 2026-09-27.
0. **Whether links should set the thambura's volume** like the claps' and
   kits' (the share-links guide describes the difference as it is).
1. **When to start the lift** (above), and whether #131's npm package and
   tsappkit's publish can share credentials.
2. **The wording and date of Evan Laforge's permission** for karya's
   patterns. `web/patterns/CREDITS.md` has a placeholder asking for it.
3. **Phone checks** on the live site, which headless Chromium can't do:
   iPhone Safari with the silent switch on, the address bar updating, Copy
   link and Share, whether the screen stays awake through a long drone,
   and how fast a cold Start is on a phone now that renders use workers
   (CDP's CPU throttle can't show that; it doesn't slow workers).
4. **A listen to the tala** against the images, to the mridangam at the
   Variety odds ("some" varies about a third of cycles, "lots" seven in
   ten), and to two thamburas together (does Ma, right, half a round
   behind, sound like a second player?).
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

- **Instruments (#94):** #99, #102, #104, #132; #144 (embed storage).
- **Filed by other sessions:** #113 (pluck patterns beyond Pa Sa Sa Sa),
  #116 (the Lab beside any skin), #121 (a built-in sound's hidden values
  change old Custom links without the drift notice).
- **Mridangam, paused:** #77 fills, eduppu and a count-in; #78 a pattern to
  suit the tempo; #79 more patterns and replacing the drafted Adi one; #80
  arai chapu and the left-hand tha; #81 the lane on a long cycle; #82
  solkattu under the strokes.
- **#72, the AAC kit:** decided by attack onset in real Chrome and Safari,
  which Playwright's Chromium (no AAC) can't measure.
- **Thambura sound:** #8 umbrella (its "second tambura panned apart" is
  ticked; a 5th string is still open); #51 a Hindustani-leaning preset;
  #45, #46, #47; #64 curves outrun a 3 s round; #52 pluck models.
- **Render speed #36:** #41 and #42, the spikes.
- **#22, hand images**, blocked on what the three kriyas should look like.
- **Upstream, panyam/notations:** #17 to #22; #19 and #21 shape how our
  pattern files are written.
- **Not filed:** the manifest's install screenshots and `og.png` still show
  the drawer-era layout (`design/render-images.mjs` regenerates them).

## Environment

- This session worked in worktrees under `thambura/` and removed each when
  its PR merged. Only `thambura/checkpoint-render` (this checkpoint's PR) is
  left; remove it once that lands. `thambura/drawer-opened-link` and
  `thambura/pwa` are older sessions' worktrees whose branches are merged;
  safe to remove if nobody claims them. No servers of this session's are
  running.
- Other sessions hold 8001 and 8002; 8080 and 8091 are something else.
  This session used 8021 to 8023. Serve a worktree on a free port, restart
  it after every rebuild, and **check the port is free afterwards**
  (`fuser` isn't installed). See CLAUDE.md, "Checking in a browser".
- Screenshots for PRs go on `pr-assets` through a worktree of
  `origin/pr-assets`; #156's are under `second-thambura/`.
- A worktree needs the kit copied in for anything mridangam (`make
  devkit`); `make deploy` and `make deploydev` upload whatever kit the
  worktree has.
- A box restart loses each worktree's `web/node_modules` and the shared
  `../.venv` (`make setupvenv` rebuilds it).
- `thambura/mridangam-data` is the `thambura-data` working copy (359 MB);
  the C recording is `thambura/01-Tanpura-Sample.mp3`, outside every
  checkout.
