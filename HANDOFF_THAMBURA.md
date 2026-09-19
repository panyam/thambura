# Handoff: Thambura

Written 2026-09-19. This folds together two sessions' handoffs: the one that
ported the app, deployed it and renamed it Thambura (PRs #1, #7), and the one
that built the thambura drone (PRs #2, #4, #5, #6). The durable notes are in
CLAUDE.md and NEXTSTEPS.md; this file is only what's in flight. Delete it once
the items below close.

## Where things stand

- master has everything and is live. thambura.com, www.thambura.com and
  thambura.appspot.com serve over HTTPS, and the live `app.js` is
  byte-identical to a build of master at c82bb87 (the check is under
  "Deploying" in CLAUDE.md). A deploy after any further merge needs the user,
  since `gcloud` is only on their Mac.
- The repo is `panyam/thambura` and the Go module `github.com/panyam/thambura`.
  The local checkouts are under `thambura/` (`main` is the shared one).
- Issue #8 holds the sound-quality plan: compare with a real tambura
  recording, fit `pluckVoice`, by-ear checks, jawari control, 5th string,
  worker rendering. That's the next piece of work. Start there.
- Nobody has listened to any of it yet, the tala clicks included. Every check
  so far is numbers (pitch within a cent, decay tables, audio scheduling
  times in headless Chromium).

## Waiting on the user

1. **A tambura recording.** Asked for: the kattai and first string, 30-60 s
   of normal playing in a quiet room with no effects, and ideally each of the
   four strings plucked alone and left to ring out. It goes in `recordings/`
   at the repo root, which must stay out of git (add it to `.gitignore` when
   it arrives). The user's description: a real tambura's note "resonates past
   the start of the next note", for much longer than ours sounded. They may
   have been listening to an old build at the time, so compare the recording
   against master, which is now what's live.
2. **A listen and a phone check** on the live site: does the tala sound right
   and stay in step with the images, does the screen stay awake through a
   long drone, and does the iPhone silent switch still mute it.
3. **Two small decisions** nobody has made yet: whether www.thambura.com
   should redirect to the bare domain, and whether to keep the dev
   container's IP (98.248.54.110) on the Namecheap API whitelist.

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
up), per-harmonic decay, where the jawari's spectral peak sits over time, the
string balance and the plucking gaps. Then fit the tambura branch of
`pluckVoice` in `web/src/engine/tambura.ts` (ring 12-36 s today, render cap
`MAX_TAMBURA_SECONDS` = 9, a choke on re-pluck in `thamburaPresenter.ts`). If
the real strings ring through their own next pluck, revisit the cap and the
choke. Put before/after plots or tables in the PR.

## Environment

- The shared checkout (`/workspace/repos/projects/thambura/main`) is on master
  and clean, with no extra worktrees. Keep it that way and work in your own
  worktree (CLAUDE.md, "Working alongside other sessions").
- Nothing is serving on :8000 any more. Serve a worktree build on its own
  port when you need one.
