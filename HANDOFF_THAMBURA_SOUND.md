# Handoff: thambura sound quality

Written 2026-09-19 at the end of the session that built the thambura drone
(PRs #2, #4, #5, #6, all merged). The durable notes are in CLAUDE.md and
NEXTSTEPS.md; this file is what's in flight. Delete it once the items below
close.

## Where things stand

- master has everything: the thambura (Mini/Studio/Raagini views), the
  sustaining tambura mode plus guitar and sruti, the sruti swara-first mix,
  and the screen wake lock. The repo is now `panyam/thambura` (PR #7, from
  another session, renamed everything).
- Issue #8 holds the sound-quality plan: compare with a real tambura
  recording, fit `pluckVoice`, by-ear checks, jawari control, 5th string,
  worker rendering. Start there.
- Nobody has listened to any of it yet. Every check so far is numbers
  (pitch within a cent, decay tables, scheduling in headless Chromium).

## Waiting on the user

1. **A tambura recording.** Asked for: the kattai and first string, 30-60 s
   of normal playing in a quiet room with no effects, and ideally each of the
   four strings plucked alone and left to ring out. It goes in `recordings/`
   at the repo root, which must stay out of git (add it to `.gitignore` when
   it arrives). The user's description: a real tambura's note "resonates
   past the start of the next note", for much longer than ours sounded. They
   may have been listening to an old build (see below), so compare against
   master first.
2. **A phone check** after the next deploy: does the screen stay awake
   through a long drone, and does the iPhone silent switch still mute it?
3. **A redeploy from master** (`make deploy`, needs `gcloud`, so the user
   runs it). The live site predates the thambura.

## How to analyse the recording

The container has no numpy, scipy, ffmpeg or sox. Options:

- Ask for WAV, and parse it in TypeScript under vitest, the way
  `web/src/engine/thambura.test.ts` already measures our renders (its
  `detectHz` autocorrelation and `rms` helpers). A throwaway probe test that
  prints numbers, then deleted, worked well for the dB-over-time table in
  PR #4.
- Or install tools first (`pip install numpy scipy soundfile`, or apt
  `ffmpeg` for m4a) if the environment allows it.

Measure, per string where possible: loudness at 1, 2, 4, 6 and 8 s relative
to just after the attack (the PR #4 table uses exactly that, so the two line
up), per-harmonic decay, where the jawari's spectral peak sits over time,
the string balance and the plucking gaps. Then fit the tambura branch of
`pluckVoice` in `web/src/engine/tambura.ts` (ring 12-36 s today, render cap
`MAX_TAMBURA_SECONDS` = 9, a choke on re-pluck in `thamburaPresenter.ts`).
If the real strings ring through their own next pluck, revisit the cap and
the choke. Put before/after plots or tables in the PR.

## Loose ends in the environment

- The shared checkout (`/workspace/repos/projects/layaguide`) is still on the
  `thambura` branch, which was merged and deleted upstream. Switch it to
  master when no other session is using it. The user's Mac clone had the
  same state; they were given `git checkout master && git pull && git fetch
  --prune && git branch -d thambura`.
- A `go run` on :8000, started from that checkout early in the session,
  serves the pre-sustain build. Don't use it for listening; build a worktree
  and serve it on its own port (CLAUDE.md, "Working alongside other
  sessions").
- This handoff and the checkpoint doc edits are on the
  `checkpoint-thambura-sound` branch, in a scratchpad worktree. Remove the
  worktree once its PR merges.
