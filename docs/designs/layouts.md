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

Worth stating first, because it decides what each option below would cost.

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
- **The islands are independent.** The page spec puts the tala in the `main`
  slot and the thambura in the `drawer` slot, and they share a page context
  (one `AudioEngine` with a track per instrument, the page's clock, the
  instruments playing, including the thambura, the Sa, the share link and
  one `KeepAwake`). The tala plays
  on the page's clock; the thambura runs its own `Transport`, which is why the
  drone's speed is its own.
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

The catch was that `open` lived in the thambura's presenter and was saved
with its settings. Docked, "open" stops meaning anything. That's the first
real seam: presentation state belongs to whatever owns the layout. #88 moved
`open` to the drawer.

Tried as `/labs/side-by-side` (#90), with one change: on a phone it stacks
the thambura under the tala instead of keeping the drawer, since stacking is
pure CSS and one presentation. That puts the thambura about 1,280 px down
the page on a 390-wide phone, which is the thing to judge before this
layout goes anywhere near `/`.

### C. Let the person choose, and remember it

A Layout menu the way the Animation menu works: **Tala focus** (today),
**Side by side**, **Shruthi focus** (the drone large, the tala a strip).
Saved with the rest of the player's choices. This is B plus a preference, and
different people want different heroes, and a menu says so without
choosing for them.

### D. Purpose modes

One step further: a mode sets layout *and* defaults. **Practice** is today.
**Concert** gives the drone the page, dims everything, hides the settings
behind a tap, and keeps the screen awake. **Teaching** shows tala and drone
together with the hand images large. **Tuning** opens the Lab alone.

This is the one I'd want, and the one that needs the most thought: a mode is a
bundle of decisions someone has to sit down and make.

### E. Separate pages

`/tala` and `/shruthi` as their own page shells, each mounting one island.
Little work in Go (another `goapplib` page plus a template), useful for sharing a
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
   full page without knowing which it's in? Since #88 it can: the drawer
   (`player/thamburaDrawer.ts`) owns `open`, and adds its flag to the
   presenter's links on their way to the address bar.
3. **The floating controls become layout-owned.** `#thambura-controls` is in
   the page template and hides when the drawer opens. In a docked layout it
   shouldn't exist at all.
4. **A slot contract for islands.** Each island already exposes
   `create*Island(el, bus, audio, …)`. If the layout owns the slots, the
   islands need to say what sizes they can take (strip, panel, page), so the
   layout can pick a presentation rather than hard-coding one.

Since #89 the page is built from a spec: Go names each island's slot,
presentation and config, a layout template draws the slots, and the browser
mounts islands from a registry into a shared page context. Two decisions
there shape what comes next, and the instrument work ([instruments.md](instruments.md))
builds on both:

- **Islands are views; instruments are seeded, not mounted.** The spec lists
  the islands a page shows and, separately, the instruments it *starts* with.
  An island doesn't mean one instrument instance. Adding a ghatam happens in
  the browser, and a track-list island will own adding and removing them,
  saving the list as instrument state.
- **Which instruments are on a page is instrument state, not layout state.**
  It's shared between `/` and any labs page, the way the thambura's settings
  are. What a layout keeps for itself is presentation: whether a drawer is
  open, which panel is wide.

## Trying layouts: labs routes

The playground is a set of pages on thambura.com itself, under
`/labs/<name>`, rather than a `make deploydev` URL. The dev version still
tests a *build* (Go, `app.yaml`, the service worker) before it's promoted; a
route can't, since it ships in the same binary as `/`. What moves to labs is
showing someone a layout. Tracked in #86, which lists the steps.

**Three kinds of experiment, three homes.** An experiment *within a page* (a
Layout menu) is a client-side choice and needs nothing new. A page that
*rearranges the same islands* (`/labs/side-by-side`) is another layout
template and another page spec, on the same `app.js`. A *truly different page*
(`/embed/demo`, a mridangam studio) gets its own esbuild entry, built with
`splitting: true` so Solid and the engine end up in shared chunks. The rule: a
new entry only when a page brings code `/` doesn't need, or must not load code
`/` does. Each entry has its own island registry, so it bundles only the
islands it can mount.

**What's already in place.** The page spec, the registry and the three
template layers came in with #89 (above, and `CLAUDE.md`): the chrome
(`BasePage.html` over goapplib's), a layout (`web/templates/layouts/`) that
draws the slots, and the page's own content. The drawer owns `open` since #88.
So a labs page is mostly a layout template, a spec, and a route. The
`Layout` field of the spec, which nothing reads yet, is how a labs page keeps
its own layout state.

**Rules for a labs page on production.** Descriptive names (`/labs/concert`,
never `/idea1`), since people will bookmark them. `noindex` like `/legacy/`,
not in the sitemap, and a canonical link to `/`. Instrument state (settings,
and which instruments are on the page) is shared with `/` on purpose; layout
state is kept per layout, so an experiment can't change how `/` looks. Its
keys go through `player/storage.ts` like the rest, since the instrument work
will rename them. A banner says it's an experiment, and it ships through
`make deploy` like anything else.

**`/embed/demo` is the library's first test.** A same-origin labs page still
gets our chrome, global Tailwind, `/static/` paths and service worker, which
hides the problems [library.md](library.md) lists first. The embed page is a
bare HTML page on its own entry that calls `mountIslands` directly, passing an
asset base URL and keeping our CSS scoped to the island roots. Later, serve
it from another origin.

**Built here, lifted later.** The page spec, registry and variants are meant
to move to tsappkit (panyam/goapplib#27) and goapplib (panyam/goapplib#28),
where lilbattle's GameViewer layouts (turnforge/lilbattle#199) and the notation
app (panyam/notation#304) are waiting for them. The lift happens after #92,
once per library, so #90 to #92 can still reshape the spec without a release
each time. Until then the TypeScript lives in `web/src/page/` and the Go in
`internal/page`, and `make liftcheck` (part of `make test`) fails if either
imports anything else from this repo, so the lift stays a copy.

## The repo as a library

The layering above is most of what a library needs, and the goal is for these
pieces to be importable elsewhere the way `notations` is, including into the
notation app itself for practice. That has its own note:
[library.md](library.md).

## Where I'd start

Cheapest first, and each is useful alone:

1. Done: the playground route (labs, above, #90), because it makes every
   later option easier to try.
2. Done: move `open` out of the thambura presenter into a layout owner
   (option B's groundwork, #88).
3. A Layout menu with Tala focus and Side by side (option C), then see which
   people use before designing modes (option D). Side by side exists as
   `/labs/side-by-side` to judge first, on a phone especially, where it
   stacks the thambura about 1,280 px down the page.
