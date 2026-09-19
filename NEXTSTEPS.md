# Next steps

In rough order. See CLAUDE.md ("Adding the shruthi box / mridangam") for the design notes.

## Live app

- [x] First deploy. thambura.appspot.com, thambura.com and www.thambura.com
      all serve over HTTPS (checked 2026-09-19).
- [ ] Redeploy from `master` (`make deploy`). The live build predates the icon
      transport controls and the thambura.
- [ ] Listen to it on a real machine. Headless Chromium has no audio device, so
      only scheduled times were verified.
- [ ] Try iOS Safari, where the ringer switch can mute Web Audio.

## Features

- [x] **Shruthi box.** The thambura: synthesized tambura and sruti modes,
      with Mini, Studio and Raagini views in a floating bar.
- [ ] Thambura follow-ups: a jawari control, a 5th string, raga presets that
      set the first string, a second tambura panned apart, a mic tuner, sampled
      tamburas, rendering plucks in a worker, and lock-screen controls
      (MediaSession).
- [ ] Listen to the thambura against a tuner app or a real sruti box, and tune
      the synth (the jawari sweep, string balance) by ear.
- [ ] **Musical timeline refactor.** Shared tempo map; sequencers emit in
      musical time with exact fractions. Needed before a second rhythmic voice.
- [ ] **Mridangam / tabla.** Per-stroke sequencer on the `percussion` bus, with
      choke groups, several takes per stroke, eduppu/korvai alignment to the
      tala, and tuning to the shruthi tonic.
- [ ] Output-latency calibration setting (Bluetooth headphones add
      150-250 ms, and Safari doesn't report `outputLatency`).
- [ ] Screen Wake Lock during practice, so a locked phone doesn't suspend audio.

## Cleanup

- [ ] Delete the unreferenced `web/static/Resources/PlayerImages/` and
      `Images/icons.xcf`.
- [ ] Decide whether to keep or drop the unused `Angas`/`Talas`/`TalaGroups`/
      `Defaults` sections of `TalasFixtures.json`.
- [ ] Rename the GitHub repo (`layaguide`) to match.
- [ ] Decide whether www.thambura.com should redirect to the bare domain
      (both serve the app as mapped).
