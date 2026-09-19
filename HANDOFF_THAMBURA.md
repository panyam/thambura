# Handoff: Thambura

Written 2026-09-19, after the thambura sound and tooling work (PRs #18, #21,
#28, #30, #33, #34). The durable notes are in CLAUDE.md, NEXTSTEPS.md and
`docs/`; this file is only what's in flight. Delete it once the items below
close.

## Where things stand

- master (3514e1b) is live: thambura.com serves a bundle byte-identical to a
  build of it (the check is under "Deploying" in CLAUDE.md). A deploy after
  any further merge needs the user, since `gcloud` is only on their Mac.
- The thambura's default voice is the jawari tambura, fitted to a 60 s
  recording of a C tambura (`docs/sound-analysis.md` has the method, the
  results and the tools). The user has listened and called it "much better".
- Listeners can now tune it and share what they find: the Lab view, `?s=`
  links, presets, and a "Share a preset" issue form (label `preset`). No
  submissions yet.
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
4. **Two small decisions** still unmade: whether www.thambura.com should
   redirect to the bare domain, and whether to keep the dev container's IP
   (98.248.54.110) on the Namecheap API whitelist.

## Open issues

- #8, thambura sound: what's left is in NEXTSTEPS.md (the two questions
  above, a recording in another key, a 5th string, a second tambura,
  rendering in a worker).
- #22, hand images for Guru, Plutham and Kakapadam: another session's.

## Environment

- This session worked from `thambura/shruthi`; other sessions use
  `thambura/main`. Both are checkouts of master; keep them on master and
  work in worktrees (CLAUDE.md, "Working alongside other sessions").
- No servers or extra worktrees are left from this session. To try a
  branch, serve a worktree on a free port (CLAUDE.md, "Working alongside
  other sessions").
- The C recording is `thambura/01-Tanpura-Sample.mp3`, outside every
  checkout. To rerun the analysis, copy it into a worktree's gitignored
  `recordings/` as `tambura-C.mp3`.
