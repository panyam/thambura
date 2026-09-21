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
- [ ] Deploy. thambura.com serves 14b1c48; master has the render work on top
      of it (#61, #62 and 9af6095).
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
      voice, now the default; the method and tools in `docs/sound-analysis.md`.
- [x] **Tuning and sharing tools:** the Lab view (#21, #33: per-string
      controls, mute/solo, copy from a string, a scope), `?s=` share links
      (#28), presets and the "Share a preset" issue form (#30), one start/stop
      in the site and bar headers plus the T key (#34).
- [ ] **Thambura sound, what's left of #8:** the second Sa's pluck is quieter
      than the recording's (+1.2 dB against +2.8), the synthesized attack is
      sharper than a finger's, and only one key (C) was measured. Also a 5th
      string and a second tambura.
- [ ] **Faster thambura renders** (tracking issue #36). The render is the wait
      on a cold Start and after every pitch or tone change. Done: the
      benchmark (#37, `pnpm bench`) and the renderer taking four harmonics per
      pass and working the harmonic-independent half of the envelope out once
      per render (#38, PRs #61 and #62). That halved it -- a cold Start went
      375 to 225 ms in the browser, and four strings 434 to 226 ms on the
      bench -- with every sample bit-identical. Two surprises worth carrying:
      #38's four-harmonics change gave 1.46x on its own, not the 3x estimated
      from a loop that left out the envelope, and the envelope is now most of
      what's left. Next: Web Workers with the strings in parallel (#39) and an
      IndexedDB cache between visits (#40). WebAssembly (#41) now looks like a
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
      string, a mic tuner, links for the tala's settings, and lock-screen
      controls (MediaSession).
- [x] **Musical timeline refactor.** A shared `TempoMap`; the tala emits
      steps and ticks at exact fractional positions.
- [ ] **Where the thambura sits** (#54, `docs/layouts.md`): the overlay suits a
      practice session, not a singer or a teacher. Docked and side-by-side
      layouts, purpose modes, separate pages. Planning only.
- [ ] **This repo as a library** (#53, `docs/library.md`): entry points shaped like
      `notations` (engine, runtime, Solid components, assets, styles), so the
      pieces can be imported elsewhere, including into the notation app for
      practice. Planning only.
- [ ] **Mridangam / tabla.** In progress; `docs/mridangam.md` is the plan and
      its build order. Steps 1 and 2 are in and were heard in Chrome on
      2026-09-21: the strokes tuned to the thambura with a pad, and one Adi
      sarvalaghu played against the tala off the same tempo map. Next is
      step 3, the pattern text format with a library and the stroke lane, then
      arrangements (variations, fills, korvai, eduppu). Still open: who writes
      or vets the patterns, and a kit we can ship.
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
