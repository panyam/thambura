# Handoff: Thambura

Written 2026-09-19, after the thambura sound and tooling work (PRs #18, #21,
#28, #30, #33, #34), and added to on 2026-09-20 after the render-speed work
(#61, #62) and the feature score (PR #63). The durable notes are in
CLAUDE.md, NEXTSTEPS.md and `docs/`; this file is only what's in flight.
Delete it once the items below close.

## Where things stand

- thambura.com runs 14b1c48 (its `/sw.js` carries the build revision, which is
  the quickest way to ask). It is deployed from the dev container, which has
  `gcloud` signed in as the project's owner (`make deploy`, a few minutes; the
  check that the live bundle matches a build is under "Deploying" in
  CLAUDE.md). **master is now 9af6095, three commits past what's live**, and
  those three are the render speed-up, so a deploy is the next thing worth
  doing.
- The thambura's default voice is the jawari tambura, fitted to a 60 s
  recording of a C tambura (`docs/sound-analysis.md` has the method, the
  results and the tools). The user has listened and called it "much better".
- Listeners can tune it and share what they find: the Lab view, `?s=`
  links, presets, and a "Share a preset" issue form (label `preset`). No
  submissions yet.
- Two sounds ship, **Shimmer** and **Warm** (`web/src/engine/presets.ts`),
  both C#3 with a 3 s round, a long ring and nothing damped. They lean
  Hindustani but were built by moving the Lab's controls, not fitted to a
  recording of a tanpura, so #51 asks players which is closer. Their names
  can become Hindustani ones once it does.
- **Renders are about twice as fast** (#37, #38, merged as #61 and #62). A
  cold Start went from 375 to 225 ms and four strings on the bench from 434 to
  226, with every sample bit-identical -- the classic and guitar fingerprints
  passed untouched, and the jawari voice, which had none, now has five of its
  own. `pnpm bench` is the yardstick and nothing runs it automatically.
  What it taught, in case it saves someone a day: the four-harmonics change
  everyone expected 3x from gave 1.46x, and the envelope, not the oscillator,
  is now most of the cost. The comment on #36 has the numbers and what they
  mean for #39-#42.
- **PR #63 (#44) is open and under review**: `features.py` measures a
  recording or a render into one JSON shape, `score.py` scores two of those
  against each other, and `tables.py` writes the tables in
  `docs/sound-analysis.md` from the committed feature files. Against the C
  recording the jawari voice scores 1.75, the classic 3.19 and the guitar
  9.36. `make soundtest` runs its 32 tests and checks the doc's tables.
  Nothing in `web/` or `internal/` changes.
- The big piece left is the **mridangam**; `docs/mridangam.md` is the plan
  and ends with a build order. Nothing of it is built yet.

## Waiting on the user

1. **Phone checks** on the live site, which headless Chromium can't do:
   iPhone Safari with the silent switch on (should still play), the address
   bar updating as settings change (Safari throws if `replaceState` runs too
   often; it's debounced to 400 ms), Copy link and Share (clipboard), and
   whether the screen stays awake through a long drone.
2. **A listen to the tala** clicks, and whether they stay in step with the
   images.
3. **Three open questions from the sound analysis**, best settled by ear in
   the Lab: whether the second Sa should pluck louder (it lifts the mix
   +1.2 dB against the recording's +2.8; raising its level to 1.0 got +2.2),
   whether a softer attack (20-30 ms, against 7 ms now) sounds closer to a
   finger, and whether a shorter ring does. The score added that last one:
   the recording's harmonics fall about twice as fast as ours, a median T60
   of 11.3 s against 23.3 s on the first string. A preset link or the Lab's
   Settings JSON is the easiest way to hand a result back.
4. **Review of PR #63**, the feature extractor and the score. The two
   places worth an opinion are the weights and tolerances at the top of
   `score.py`, which decide what "closer" means and which #45 will optimize
   against, and the decision to print the buzz between the harmonics without
   counting it in the total. Both carry a comment on the PR.
5. **A recording of iTablaPro's tanpura**, the app a listener compared us
   to, or of any real tanpura (#47). Half a minute is enough, and
   `tools/sound-analysis` turns it into the same numbers we fitted the
   thambura to, which would replace the guesswork behind Shimmer and Warm
   with a fit (#44, #45).
6. **Two small decisions** still unmade: whether www.thambura.com should
   redirect to the bare domain, and whether to keep the dev container's IP
   (98.248.54.110) on the Namecheap API whitelist.

## Open issues

- #8, thambura sound: the umbrella. What's left is the three questions above,
  a 5th string, a second tambura, and whether sampled tamburas are worth it.
- #51, a Hindustani-leaning preset: Shimmer and Warm are posted there with
  their links and measurements, waiting on players.
- #44 a feature extractor and score, in review as PR #63. #45 (fitting the
  Lab's parameters to a recording automatically) is next and reads
  `score.py --json`. #46 a differentiable synth to show what the model can't
  do, #47 more recordings, which each add a feature file.
- #64, filed from #63: the per-string curves are read at fixed times up to
  4 s, which the 3 s rounds of Shimmer and Warm outrun, and it is unsettled
  whether curves should be compared at absolute times or at shares of the
  round. Nothing measured so far is affected; every feature file is a 5.8 s
  round.
- #52, pluck models behind one interface: what the additive synth can't
  express, and a physical string-bridge model as a spike. The model is per
  string, so they can be mixed.
- #36, render speed: #37 and #38 are closed. #39 (workers) and #40 (an
  IndexedDB cache) are the next two and are unaffected by what changed; #41
  (WebAssembly) now looks a poor trade, and #42 (an AudioWorklet) is still
  open.
- #22, hand images: another session's, and blocked on deciding what the three
  kriyas should look like.

## Environment

- This session worked from `thambura/shruthi`; other sessions use
  `thambura/main`. Both are checkouts of master; keep them on master and
  work in worktrees (CLAUDE.md, "Working alongside other sessions").
- These sessions left no servers, and two worktrees:
  `thambura/wt-sound-features` (branch `sound-features`, PR #63) and
  `thambura/wt-checkpoint` (this update). Remove them once the PRs land,
  and note that a box restart loses the worktrees' `web/node_modules` and
  `tools/sound-analysis/.venv`, neither of which is committed. To try a
  branch, serve a worktree on a free port, checking first that it is free:
  other sessions hold 8001, 8002 and 8010 (CLAUDE.md, "Working alongside
  other sessions").
- The C recording is `thambura/01-Tanpura-Sample.mp3`, outside every
  checkout. To rerun the analysis, copy it into a worktree's gitignored
  `recordings/` as `tambura-C.mp3`, then `pnpm render-mix` in `web/` for the
  renders. Measuring all four files takes about six minutes, most of it the
  60 s recording. The feature files in `tools/sound-analysis/features/` are
  committed for exactly this reason: the tables and the scores can be redone
  without any of it.
