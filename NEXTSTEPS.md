# Next steps

In rough order. See CLAUDE.md ("Adding the shruthi box / mridangam") for the design notes.

## Live app

- [x] First deploy. thambura.appspot.com, thambura.com and www.thambura.com
      all serve over HTTPS (checked 2026-09-19).
- [x] Redeploy from `master`. thambura.com serves the same bundle as master
      at c82bb87 (checked 2026-09-19).
- [x] Redeploy after the thambura work (#18-#34): thambura.com serves the
      same bundle as master at 3514e1b (checked 2026-09-19).
- [x] Listen to the thambura on a real machine (it's been tuned by ear since).
- [x] Deploy the layouts, docs and instruments work. thambura.com serves
      3c4e21a (checked 2026-09-27): the session strip, the track list on `/`
      with no drawer, pluck workers and cache, and the mridangam kit, which
      is now public.
- [x] Deploy #148 (the tala across the top, `/about`) and #149 (instrument
      rows). thambura.com serves 6f5c85e (checked 2026-09-28), which has
      both.
- [x] Deploy #156 (a second thambura), #160 (Kriyas), #165 (the
      thambura's volume in links) and #167. thambura.com serves df1e4ba
      (checked 2026-09-28), and the docs site was published from it.
- [ ] Listen to the tala on a real machine, and check it stays in step with
      the images. Headless Chromium has no audio device.
- [ ] Record iTablaPro's tanpura, or any real tanpura, and run it through
      `tools/sound-analysis` (#47). It would put numbers behind "sounds
      closer to Hindustani" and give #45 something to fit to.
- [ ] Try iOS Safari with the silent switch on. `navigator.audioSession.type` is
      now "playback", which should stop the switch muting it (Safari 16.4+).

## Features

- [x] **Shruthi box.** The thambura: synthesized tambura and sruti modes,
      with Mini, Studio and Raagini views in a floating bar.
- [x] **Thambura fitted to a real recording** (issue #8, PR #18): the jawari
      voice, now the default; the method and tools in `docs/designs/sound-analysis.md`.
- [x] **Tuning and sharing tools:** the Lab view (#21, #33: per-string
      controls, mute/solo, copy from a string, a scope), `?s=` share links
      (#28), presets and the "Share a preset" issue form (#30), one start/stop
      in the site and bar headers plus the T key (#34).
- [ ] **Thambura sound, what's left of #8:** the second Sa's pluck is quieter
      than the recording's (+1.2 dB against +2.8), the synthesized attack is
      sharper than a finger's, our strings ring about twice as long as the
      recording's, and only one key (C) was measured. Also a 5th string and a
      second tambura.
- [x] **One extractor and one score** (#44): `features.py` measures a
      recording or a render into a committed feature file, `score.py` puts the
      jawari voice at 1.75 against the C recording, the classic at 3.19 and
      the guitar at 9.36, and `tables.py` writes the doc's tables from the
      feature files. Fitting parameters to the score is #45.
- [ ] **Faster thambura renders** (tracking issue #36). The render is the wait
      on a cold Start and after every pitch or tone change. Done: the
      benchmark (#37, `pnpm bench`) and the renderer taking four harmonics per
      pass and working the harmonic-independent half of the envelope out once
      per render (#38, PRs #61 and #62). That halved it -- a cold Start went
      375 to 225 ms in the browser, and four strings 434 to 226 ms on the
      bench -- with every sample bit-identical. Two surprises worth carrying:
      #38's four-harmonics change gave 1.46x on its own, not the 3x estimated
      from a loop that left out the envelope, and the envelope is now most of
      what's left. Rendering now runs in Web Workers, the strings in
      parallel (#39), off the main thread entirely, and a returning visitor's
      plucks come from IndexedDB with no render at all (#40); a settings page
      for the cache's size is #138. WebAssembly (#41) now looks like a
      poor trade and an AudioWorklet (#42) is still open; the comment on #36
      has the measurements behind both.
- [ ] **Hand images for Guru, Plutham and Kakapadam** (#22): the kriyas to
      draw, and talas in the menu that use them.
- [x] Presets that ship with the app (`web/src/engine/presets.ts`): Shimmer
      and Warm, two Hindustani-leaning candidates (#51). Adding one means
      building it in the Lab and pasting its link in.
- [ ] Turn good "Share a preset" submissions (issues labelled `preset`) into
      built-in presets, and rename Shimmer and Warm once players say which
      is closer (#51).
- [ ] Pluck models behind one interface (#52): what the additive synth can't
      express (inharmonicity, two-stage decay, a real buzz, body resonance,
      sympathetic ringing), and a physical string-bridge model as a spike.
- [ ] Thambura extras outside sound quality: raga presets that set the first
      string, a mic tuner, and lock-screen controls (MediaSession). (Links
      carry the tala's settings since #136.)
- [x] **Musical timeline refactor.** A shared `TempoMap`; the tala emits
      steps and ticks at exact fractional positions.
- [x] **Where the thambura sits** (#54, `docs/designs/layouts.md`): settled
      by the track list (#101). `/` is the tala across the top and a row per
      instrument under it, the thambura's panel opening in its row; the
      drawer is gone (#142, #148, #149). `/labs/side-by-side` and embeds
      still dock it in a slot of its own.
- [ ] **This repo as a library** (#53, `docs/designs/library.md`): entry points shaped like
      `notations` (engine, runtime, Solid components, assets, styles), so the
      pieces can be imported elsewhere, including into the notation app for
      practice. The first two blockers are gone: `embed.js` (#92) mounts the
      islands on any page, in shadow roots, with assets resolved against
      itself. The spec's Go half is goapplib's `page` package since
      goapplib#30 (v0.2.0), with thambura's instruments in its own extended
      spec. Next: `web/src/page` into tsappkit (panyam/goapplib#27; waiting
      apps turnforge/lilbattle#199 and panyam/notation#304), serving
      `embed.js` from unpkg as a versioned package (#131), and asset packs
      (#132). Layout variants and labs helpers (goapplib#28) wait for
      lilbattle.
- [ ] **Developer docs** (#95, https://panyam.github.io/thambura/): the
      site (#105), Getting started, share links and presets with the format
      reference (#110), and the embed guide with live examples (#109) are
      published, with a live kit example (#154), and indexed (#161).
      Left: #106
      (kit.json) and #107 (patterns) alongside #102 and #99; #111 after the
      lift; and the move to docs.thambura.com (steps in `docs/README.md`).
- [x] **Mridangam, steps 1 to 4** (`docs/designs/mridangam.md`): strokes tuned to the
      thambura with a pad, patterns written in the notations DSL and compiled
      at build time, written patterns for Adi, Short Rupakam and the Misra and
      Khanda chaapus with a generated skeleton for everything else, the stroke
      lane, variations and a korvai. Heard in Chrome on 2026-09-21.
- [ ] **Solkattu as the patterns' vocabulary** (`docs/designs/solkattu.md`).
      Done: the stroke names and the counting line in the lane (#162). Next:
      a `sol:` role realized through a phrase table (step 3), then solkattu
      in the lane (#82), then the editor and korvais on demand.
- [ ] **Mridangam, what's left**, tracked as #77 (fills, eduppu, count-in),
      #78 (pattern per tempo), #79 (more patterns, and replacing the drafted
      Adi one), #80 (record arai chapu and the left-hand tha), #81 (the lane
      on a long cycle), #82 (solkattu under the strokes). Still open too: who
      vets the patterns, and a kit we can ship.
- [ ] **Several instruments at once** (`docs/designs/instruments.md`, epic #94).
      Done: a mixer track per instrument (#96), the kit as a track that
      resumes on sam (#97), the claps as a track so the tala only keeps time
      (#98), SaRiGaMa dropped (#122), the thambura as an instrument with an
      id and share links that carry every instrument (#100), and the track
      list (#101: the page's speed and shruthi strip #136, the list #139, on
      `/` #142, rows #149), and a second thambura, as iTanpura plays two
      (#103: Ma, panned right, half a round behind). Next: #102 (drawn pads); #99 with the first new kit (#104);
      #132 (asset packs, from the layouts side). The hands track
      shows as "Kriyas" (it was "Claps"). A kit now names its own
      generated-fallback strokes (#166), and the ghatam and tabla are
      designed on paper (`docs/designs/percussion-vocabularies.md`, #164):
      the questions for a player there, and a ghatam recording session,
      come before #104's ghatam kit.
- [ ] **Several talas at once**, later: talas stay their own group, not
      instruments (`docs/designs/instruments.md`, "Several talas at once").
- [ ] Output-latency calibration setting (Bluetooth headphones add
      150-250 ms, and Safari doesn't report `outputLatency`).
- [x] Screen Wake Lock while the tala or thambura plays, so the screen doesn't
      time out mid-practice.
- [ ] Check on real phones what a power-button lock does. iOS suspends Web
      Audio regardless; Android Chrome usually keeps playing (more reliably
      with Chrome's battery setting on Unrestricted). Media Session controls
      on the lock screen would be the next step there.

## Cleanup

- [x] Delete the unreferenced `PlayerImages/` and move `icons.xcf` to
      `design/`, out of the deployed static folder.
- [x] Move the unused `Angas`/`Talas`/`TalaGroups`/`Defaults` sections of
      `TalasFixtures.json` to `design/tala-tables-2016.json`. Neither app ever
      read them, but they sketch ideas `carnatic.ts` doesn't have: chaapus as
      several half- and whole-count beats, a Faves group, and a `mukhi` default.
- [x] Rename everything to Thambura (repo, module, display name).
- [x] Rename the local `layaguide` folder (now `thambura/`).
- [ ] Decide whether www.thambura.com should redirect to the bare domain
      (both serve the app as mapped).
