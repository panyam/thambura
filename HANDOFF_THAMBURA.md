# Handoff: Thambura

Written 2026-09-28, after the render work (#39 in #137, #40 in #140) and a
second thambura (#103 in #156), and updated the same day after the ghatam
and tabla design (#164), the kit-named fallback (#166 in #168, with
thambura-data#2), the Kriyas rename (#160), the thambura's volume in links
(#153 in #165) and the drift checksum (#121 in #170), with the solkattu thread (#155,
#162) added after. It folds forward
what's still open from the 2026-09-27 handoff and drops what closed: #103,
#121, #153, the #148/#149 and #156 deploys, #54, the hands track's name,
the embed guide's kit example (#154), and the stale worktrees. The durable notes are in
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
- **Deployed:** thambura.com serves df1e4ba, master as of 2026-09-28
  (checked by comparing `app.js`): a second thambura (#156), Kriyas (#160),
  the thambura's volume in links (#165) and #167. The docs site was
  published from the same commit. Not live yet: #168 (below) and #170
  (format 4).
- **Thambura links went to format 3 (#165, the volume) and then format 4
  (#170, a drift checksum that covers the hidden values).** A build from
  before a format drops a new link's thambura part, and the track list
  then opens without the thambura. That's accepted; it mostly hits the
  first load after a deploy, from the service worker's old build.
- **The hands track is "Kriyas"** (#160), display only: the id, storage
  and link part are still `hands-1`.
- **The lift into goapplib and tsappkit** is half done. The Go half is
  goapplib#30 (PR goapplib#31, `v0.2.0`): a generic `page.Spec` of layout
  and islands, which thambura embeds with its own instruments, and the
  `PageSpecScript` partial. goapplib#28 keeps only layout variants and
  labs/SEO helpers, for lilbattle. Next is goapplib#27, `web/src/page` into
  tsappkit `0.1.0` with an entry point that takes a registry, which needs
  `npm login` here (`npm whoami` says ENEEDAUTH). A fresh goapplib clone
  lives at `../goapplib-lift/goapplib` (the `newstack/` one isn't a working
  checkout).
- **The mridangam is still paused** (#77 to #82).
- **The ghatam and tabla are designed, not built**
  (`docs/designs/percussion-vocabularies.md`, #164). It ends in nine
  questions for a player's ear, which need a player, not a session.
  Nothing openly licensed has isolated ghatam strokes, so the doc suggests
  a recording session. For a first tabla kit, Deolekar's set on Zenodo
  (4327350, CC BY 4.0) is enough.
- **A kit names its own generated-fallback strokes** (#168). Before the
  next deploy of master, run `make devkit` in the deploying worktree
  (thambura-data#2 is merged, so `../mridangam-data` has the map; `git
  pull` it first). A kit without the map plays nothing on Ata and every
  other tala without a written pattern. Not live yet.

## Next on the instruments path

1. **#102, drawn pads** from a `layout` in `kit.json`, under the kit row's
   toggle where the pad is now.
2. **#159, a generic kit builder here**, before #104 copies thambura-data's
   scripts into a second data repo.
3. **#99 with #104:** patterns naming their instrument, with the first
   ghatam or kanjira kit, which needs recordings first. A second copy of
   the same kit waits on this too, since two would play the same pattern.
4. **#132, asset packs**, and **#144** (embeds save to the host's
   localStorage under our keys).
5. **#138, a settings page for the pluck cache** (its size, Clear, usage).
   Filed this session; it should count both thamburas' entries.

## The solkattu path (the mridangam's vocabulary)

`docs/designs/solkattu.md` is the plan: patterns written in solkattu and
realized into strokes through a phrase table. Steps 1 and 2 are live
(#162 with thambura-data#1, thambura.com version 20260928t061843): the
kit's labels are Ki, Din, Dim and Thom din, and the lane shows the tala's
counting line (*ta ka di mi*, `engine/syllables.ts`, published on
`clock.tala` as `counting`).

Decided with the user on 2026-09-28, for step 3:

- **`sol:` is a role** in the notations DSL beside `mrid:`, like any other,
  with a meaning only we give it.
- **The left-hand tha (`p`) plays a soft ki** (`R.thi`, lower gain) until
  it's recorded (#80), marked as a stand-in so the lane can show it.
- **The default phrase table is accepted**: the fourteen defaults in
  solkattu.md plus the single-syllable additions (*din* → `od`, *tat* and
  *ta* → `k`, *dit* → `t`, *ta din* → `k od`, *tat dit* → `k t`).

Next, in order:

1. **Step 3:** the `sol:` role and the phrase table in
   `scripts/compile-patterns.mjs`. Where things get edited, so the user
   can change the table later: defaults in
   `web/patterns/realize/mridangam.json` (one file per instrument kind), one
   piece's choice in its `.not` front matter (`realize:`), and what a
   letter plays on this kit, the `p` stand-in included, in
   `web/patterns/strokes.json`, which becomes the letter table. A phrase
   with no entry is a build error naming it; `pnpm patterns:check` in
   `make test` catches stale data. Write that table into solkattu.md's
   format section too, and later into the "write a pattern" guide (#107).
2. **Step 4, #82:** solkattu in the lane, large, over the strokes, with the
   counting line when a pattern has none.
3. **Then** the pattern editor, a korvai every N cycles, and the korvai
   generator, all working in syllable ids.
4. **#81** (wrap the lane by anga) gets more pressing: the counting rows
   make sankeernam's cells nine rows tall and the lane wider.

Also from this thread:

- Syllables and strokes are held by id everywhere (saved patterns, links,
  the table); only `syllables.ts` and `kit.json` spell them.
- Speeds (1st, 2nd, 3rd per nadai) are still undefined; *ta ka di mi ta ka
  jo nu* is in the table but nothing plays second speed.
- **thambura-ext** (`panyam/thambura-ext`, private, checked out at
  `../../thambura-ext/main`) holds code tied to one outside project's
  format; `karya/phrase_tally.py` produced the override counts in
  solkattu.md. Generic tools stay here (CLAUDE.md says which).

## Small follow-ups from #103, not filed

- A pan control per thambura, as iTanpura has one per tanpura. The second's
  0.4 is fixed and unsaved today. Carrying it in links means a thambura
  link format bump, as the volume did (#165).
- The docked `thambura` island (`/labs/side-by-side`, embeds) always shows
  `thambura-1`.
- The T key's hint and `#play-all`'s title still say "the thambura".

## Waiting on the user

0. **The mridangam dataset's licence** (thambura-ext#1): Zenodo reads CC
   BY-NC 4.0 for the kit on thambura.com. Ship under NC with an
   attribution, ask the authors, or record our own.
0. **The nine player's-ear questions** at the end of
   `percussion-vocabularies.md` (ghatam open/closed and zones, the gumki,
   the mridangam-to-ghatam letter map, a summed tabla dha, bols, the
   bayan's bend, Rupak's first beat, Ektaal's fourth vibhag).
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
   (converted by us, unverified) or generated; the Adi one is transcribed
   from a practice pattern shared with permission (provenance in
   thambura-ext). More talas come the same way, written straight into `mrid:`
   lines; a vocabulary PR on top of #175 will let them keep their source's
   stroke names in quotes (`"tha+num"`), with stand-ins through `standIn`.

## Open issues

- **Instruments (#94):** #99, #102, #104, #132; #144 (embed storage);
  #159 (a generic kit builder, filed by another session).
- **thambura-ext#1:** the mridangam dataset's licence.
- **Filed by other sessions:** #113 (pluck patterns beyond Pa Sa Sa Sa),
  #116 (the Lab beside any skin).
- **Mridangam, paused:** #77 fills, eduppu and a count-in; #78 a pattern to
  suit the tempo; #79 more patterns; #80
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

- Only `thambura/checkpoint-volume` (this checkpoint's PR) is left of this
  session's worktrees; remove it once that lands. The older
  `checkpoint-render`, `drawer-opened-link` and `pwa` worktrees are gone.
  No servers of this session's are running.
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
