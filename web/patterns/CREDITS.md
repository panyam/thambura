# Where these patterns came from

## karya (Evan Laforge)

Three of the patterns here are derived from
[`Solkattu/Score/MridangamSarva.hs`](https://github.com/elaforge/karya/blob/work/Solkattu/Score/MridangamSarva.hs)
in [karya](https://github.com/elaforge/karya), a collection of Carnatic
percussion scores that Evan Laforge transcribed from his teachers. The repo
is GPL-3.0. 

| Ours | From | Attribution in the source |
|---|---|---|
| `misra-chaapu.not` | `kir_misra_2` | learned from Ganesh, dated 2017-09-26 |
| `khanda-chaapu.not` | `s_bhajan_kanda`, the `N,ND,` variation | references [this recording](https://www.youtube.com/watch?v=ctpe5H1Snd0) |
| `rupakam-chatusram.not` | `s_rupaka`, first line | dated 2026-02-05 |

`adi-chatusram.not` is not from karya; it's the Mridangam app's (below).

## The Mridangam app (Shashibhushan)

`adi-chatusram.not` is the Adi pattern from Shashibhushan's Android app
"Mridangam (Mridanga Laya Vinyasa)"
([org.shashiapps.mridangam](https://play.google.com/store/apps/details?id=org.shashiapps.mridangam)),
used with his permission. It replaced an Adi pattern drafted here that no
mridangist had checked.

The app is a sequencer of strokes, so its patterns are copied stroke for
stroke rather than transcribed by ear. The converter and its stroke table
live in thambura-ext (`mridanga-laya-vinyasa/`), with the app's lines as
they were written down. The app has three left-hand strokes: tha (a closed
slap on the thoppi), thom and gumki. This kit has no take for its tha, so
the app's tha+num plays `tham` (thom with nam) until one is recorded (#80):
a boom where the app slaps, in the same place.

## How karya's notation was converted

karya writes a stroke per character, and the conversion is ours, so any
mistake in it is ours too. What each character meant, and what this kit plays
for it:

| karya | What it is | Here |
|---|---|---|
| `n` | nam, right head | `nam` |
| `d` | din, right head | `dhin` |
| `k` | ki, a light closed right stroke | `thi` |
| `t` | ta, closed right | `ta` |
| `o` | thom, open bass | `thom` |
| `N` | thom with nam, both heads | `tham` |
| `D` | thom with din | `dheem` |
| `,` | kin, a light ki on meetu | `thi` |
| `_` | a rest | `,` |

Two of those are approximations, and both are noted in the pattern that uses
them. `,` (kin) is a meetu stroke this kit has no take for, so it plays `thi`,
which is closed rather than ringing. `D` is thom with din; the kit's `dheem`
is a bass stroke with the right head ringing, which is close but not the same
hand shape.

karya also has strokes this kit simply lacks, notably arai chapu (`u`) and
the left-hand tha (`p`). The kit lacks them because the CompMusic dataset
does: its ten labels have no arai chapu and no left-hand tha. The gumki was
missing too, and is now declared as a thom with the pitch bent up, since that
is the technique rather than a different hit.
Patterns using them were left alone rather than approximated, which is why
the three above were chosen from a much larger collection. Adding a stroke is
a data change, three lines in the manifest builder plus takes, so a recording
session would open up more of karya's material.

**A naming trap:** this kit's `tha` is not karya's `p`. The dataset's `tha`
measured as a closed stroke on the *right* head, which is what `R.tha` is
here. karya's `p` is the left-hand tha, a damped slap on the thoppi. Same
word, different hand.

## What still needs a player

Every pattern's `source` says whether a mridangist has checked it. None of
karya's has; the app's are the app author's own, played as he wrote them.
The conversion above is the part most likely to be wrong: the stroke choices
are defensible from the descriptions, but only an ear can say whether the
result sounds like the pattern Evan learned.
