# Next steps

In rough order. See CLAUDE.md ("Adding the shruthi box / mridangam") for the design notes.

## Live app

- [x] First deploy. thambura.appspot.com, thambura.com and www.thambura.com
      all serve over HTTPS (checked 2026-09-19).
- [x] Redeploy from `master`. thambura.com serves the same bundle as master
      at c82bb87 (checked 2026-09-19).
- [ ] Listen to it on a real machine. Headless Chromium has no audio device, so
      only scheduled times were verified.
- [ ] Try iOS Safari with the silent switch on. `navigator.audioSession.type` is
      now "playback", which should stop the switch muting it (Safari 16.4+).

## Features

- [x] **Shruthi box.** The thambura: synthesized tambura and sruti modes,
      with Mini, Studio and Raagini views in a floating bar.
- [ ] **Thambura sound quality** (issue #8). Compare with a real tambura
      recording the user will supply, fit the synth to it, check by ear. Also
      the jawari control, a 5th string, a second tambura, and rendering in a
      worker.
- [ ] Thambura extras outside sound quality: raga presets that set the first
      string, a mic tuner, and lock-screen controls (MediaSession).
- [ ] **Musical timeline refactor.** Shared tempo map; sequencers emit in
      musical time with exact fractions. Needed before a second rhythmic voice.
- [ ] **Mridangam / tabla.** Per-stroke sequencer on the `percussion` bus, with
      choke groups, several takes per stroke, eduppu/korvai alignment to the
      tala, and tuning to the shruthi tonic.
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
- [ ] Decide whether to keep or drop the unused `Angas`/`Talas`/`TalaGroups`/
      `Defaults` sections of `TalasFixtures.json`.
- [x] Rename everything to Thambura (repo, module, display name).
- [ ] Rename the local `layaguide` folder, with no sessions open in it.
- [ ] Decide whether www.thambura.com should redirect to the bare domain
      (both serve the app as mapped).
