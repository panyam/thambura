# Handoff: Thambura

Written 2026-09-19, after the thambura sound and tooling work (PRs #18, #21,
#28, #30, #33, #34). The durable notes are in CLAUDE.md, NEXTSTEPS.md and
`docs/`; this file is only what's in flight. Delete it once the items below
close.

## Where things stand

- thambura.com runs master at 9c348c0, deployed from the dev container,
  which has `gcloud` signed in as the project's owner (`make deploy`, a few
  minutes; the check that the live bundle matches a build is under
  "Deploying" in CLAUDE.md). master has moved on to 14b1c48, which the user
  is deploying.
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
3. **Two open questions from the sound analysis**, best settled by ear in
   the Lab: whether the second Sa should pluck louder (it lifts the mix
   +1.2 dB against the recording's +2.8; raising its level to 1.0 got +2.2),
   and whether a softer attack (20-30 ms, against 7 ms now) sounds closer to
   a finger. A preset link or the Lab's Settings JSON is the easiest way to
   hand a result back.
4. **A recording of iTablaPro's tanpura**, the app a listener compared us
   to, or of any real tanpura (#47). Half a minute is enough, and
   `tools/sound-analysis` turns it into the same numbers we fitted the
   thambura to, which would replace the guesswork behind Shimmer and Warm
   with a fit (#44, #45).
4. **Two small decisions** still unmade: whether www.thambura.com should
   redirect to the bare domain, and whether to keep the dev container's IP
   (98.248.54.110) on the Namecheap API whitelist.

## Open issues

- #8, thambura sound: the umbrella. What's left is the two questions above,
  a 5th string, a second tambura, and whether sampled tamburas are worth it.
- #51, a Hindustani-leaning preset: Shimmer and Warm are posted there with
  their links and measurements, waiting on players.
- #44 a feature extractor and score, #45 fitting the Lab's parameters to a
  recording automatically, #46 a differentiable synth to show what the model
  can't do, #47 more recordings. #44 is the one to start with.
- #52, pluck models behind one interface: what the additive synth can't
  express, and a physical string-bridge model as a spike. The model is per
  string, so they can be mixed.
- #36 and its children (#37-#42), render speed, and #22, hand images: other
  sessions'.

## Environment

- This session worked from `thambura/shruthi`; other sessions use
  `thambura/main`. Both are checkouts of master; keep them on master and
  work in worktrees (CLAUDE.md, "Working alongside other sessions").
- No servers or extra worktrees are left from this session. To try a
  branch, serve a worktree on a free port, checking first that it is free:
  other sessions hold 8001, 8002 and 8010 (CLAUDE.md, "Working alongside
  other sessions").
- The C recording is `thambura/01-Tanpura-Sample.mp3`, outside every
  checkout. To rerun the analysis, copy it into a worktree's gitignored
  `recordings/` as `tambura-C.mp3`.
