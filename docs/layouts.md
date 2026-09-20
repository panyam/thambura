# Where the thambura lives

A listener asked why the thambura is an overlay, and whether the tala and the
thambura could both sit on the page. The honest answer is that the overlay
suits one way of practising: you set a shruthi once for a session and leave
it, while the tala is the thing you keep touching, so it gets the page and the
drone gets a drawer.

That holds for a violin student running scales. It doesn't hold for everyone.
A singer warming up may want the drone large and the tala silent. A teacher
wants both at once. Someone tuning a sound in the Lab wants that view and
nothing else. This note collects the layouts that would serve them, what each
costs, and what the code would have to grow to support several. Nothing here
is scheduled; tracked in #54.

## What the code already allows

Worth stating first, because it decides which options are cheap.

- **Three layers, and the dependencies only point one way.** `engine/` is pure
  TypeScript with no DOM, audio or timers, and never imports from `player/`.
  The presenters (`presenter.ts`, `thamburaPresenter.ts`) own state and
  intents but import no Solid. The `.tsx` files are the only Solid code.
- **The views are already components.** `ThamburaMini`, `ThamburaStudio`,
  `ThamburaRaagini` and `ThamburaLab` each take `{ state, actions }` and
  nothing else (`ThamburaViewProps`). They don't know they're in a drawer.
- **The drawer is one file.** `ThamburaBar.tsx` owns the sliding panel, the
  height it reports, and the switch between views. Mounting `ThamburaMini`
  somewhere else needs no change to the view.
- **The islands are independent.** `main.ts` mounts the tala on `#player` and
  the thambura on `#thambura`. They share one `AudioEngine` (buses `tala`,
  `drone`, `percussion`), one `KeepAwake`, and nothing else. Each runs its own
  `Transport`, which is why the drone's speed is its own.
- **A setup already travels.** `?s=` carries the whole thambura setup,
  including the Lab's plan, and each island keeps its own localStorage key.

So "put the thambura on the page" is a layout question, not an architecture
question. What's missing is a place to decide the layout.

## The options

### A. Keep the drawer (today)

The tala is the page; the thambura slides up. Suits a practice session where
the shruthi is set once. It's also the only layout that works on a phone
without scrolling past one instrument to reach the other.

### B. Dock it on wide screens

On a wide screen, put the tala and the thambura side by side, the drone in
`ThamburaMini` or `ThamburaStudio`; keep the drawer on phones. The views
already take `{ state, actions }`, so this is a layout wrapper plus a rule
about which presentation to use at which width.

The catch is that `open` currently lives in the thambura's presenter and is
saved with its settings. Docked, "open" stops meaning anything. That's the
first real seam: presentation state belongs to whatever owns the layout.

### C. Let the person choose, and remember it

A Layout menu the way the Animation menu works: **Tala focus** (today),
**Side by side**, **Shruthi focus** (the drone large, the tala a strip).
Saved with the rest of the player's choices. This is B plus a preference, and
it answers the question honestly: different people want different heroes.

### D. Purpose modes

One step further: a mode sets layout *and* defaults. **Practice** is today.
**Concert** gives the drone the page, dims everything, hides the settings
behind a tap, and keeps the screen awake. **Teaching** shows tala and drone
together with the hand images large. **Tuning** opens the Lab alone.

This is the version worth wanting, and the one that needs the most thought,
because a mode is a bundle of decisions someone has to design.

### E. Separate pages

`/tala` and `/shruthi` as their own page shells, each mounting one island.
Cheap in Go (another `goapplib` page plus a template), useful for sharing a
link to one tool, and it makes the installed app able to carry **shortcuts**
in the manifest, so a long press on the icon offers "Shruthi box" directly.
The cost is that two pages means two audio contexts and two sets of state, so
"both at once" has to stay on one page.

### F. Two devices

The share link already carries a whole setup. A "send to my phone" QR code
would let the laptop keep the tala while the phone becomes the shruthi box
beside the mic. Nothing to build in the engine; it's a small page that renders
the link as a QR.

### G. The mridangam forces the question

The drum is a third island on the tala's transport. Two voices fit in a drawer
and a page; three don't, without a layout that can be told where things go.
Whatever is chosen here should assume N instruments, not two.

## What the code would need

In order of how much it moves:

1. **A layout owner.** One component that decides where each island goes and
   in which presentation (page, column, drawer, strip). Today that decision is
   split between `HomePage.html` (where the mounts are), `ThamburaBar` (the
   drawer) and the thambura's presenter (`open`).
2. **Presentation out of the presenter.** `open` becomes the layout's business.
   The presenter keeps what the *instrument* is doing: settings, playing, view.
   A good test: could the same presenter drive a docked panel, a drawer and a
   full page without knowing which it's in? Today it can't, quite.
3. **The floating controls become layout-owned.** `#thambura-controls` is in
   the page template and hides when the drawer opens. In a docked layout it
   shouldn't exist at all.
4. **A slot contract for islands.** Each island already exposes
   `create*Island(el, bus, audio, …)`. If the layout owns the slots, the
   islands need to say what sizes they can take (strip, panel, page), so the
   layout can pick a presentation rather than hard-coding one.

## The repo as a library

The layering above is most of what a library needs, and the goal is for these
pieces to be importable elsewhere the way `notations` is, including into the
notation app itself for practice. That has its own note:
[library.md](library.md).

## Where I'd start

Cheapest first, and each is useful alone:

1. The playground route, because every later option is easier to try there.
2. Move `open` out of the thambura presenter into a layout owner (option B's
   groundwork), which is small and makes the presenter honest.
3. A Layout menu with Tala focus and Side by side (option C), then see which
   people use before designing modes (option D).
