# Next steps

In rough order. See CLAUDE.md ("Adding the shruthi box / mridangam") for the design notes.

## Before merging the port (PR #1)

- [ ] Listen to it on a real machine. Headless Chromium has no audio device, so
      only scheduled times were verified.
- [ ] Try iOS Safari, where the ringer switch can mute Web Audio.
- [ ] Check that App Engine offers `runtime: go126` (go.mod needs Go 1.26.3),
      then deploy.

## Features

- [ ] **Shruthi box.** A drone voice on the `drone` bus. Start synthesized
      (any pitch, no assets), with sampled loops as a later option. The tonic
      lives in the engine.
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
- [ ] Rename the GitHub repo and App Engine project (`layagnana`) to Sadhana.
- [ ] Delete the `pr-assets` screenshot branch after PR #1 merges, if unwanted.
