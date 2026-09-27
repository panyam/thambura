# Thambura as a library

The pieces here should be importable in other projects the way
`notations` is, and the first target is the **notation web app** (the
`notation` repo, whose frontend package is `notationfe`): a student reading a
kriti should be able to start the tala and the drone beside the notation
without leaving the page. `notations`, the library, is the packaging
precedent, not the consumer. This note is the plan for getting there;
tracked in #53, not scheduled.

## What `notations` does, since we'd mirror it

`notations` (npm, v1.0.9) ships:

- a framework-free core at `.`, the browser and UI code at `./web`, and an
  integration at `./web/dockview`, so a consumer takes only what it needs
- both ESM and CJS builds (`lib/esm`, `lib/cjs`) with types alongside
- CSS as built files under `./styles/*` and `./dist/*`, so it can be linked or
  imported without a build step
- a UMD bundle for a plain `<script>` tag
- `dockview-core` as a peer dependency rather than a dependency

That shape maps onto this repo almost exactly.

## What the first consumer is built with

The notation web app is Go plus **webpack**, with Tailwind, `@panyam/tsappkit`,
`dockview-core` and `notations` itself. It has **no Solid**. That shapes the
plan more than anything else here:

- The engine and the runtime are plain TypeScript and drop straight in.
- The Solid components can't be a peer-dependency import there. They would
  ship as a **self-mounting bundle with Solid inside it**, the way `notations`
  ships a UMD build: the host passes an element and gets a working drone or
  tala, with no framework of its own involved. `createThamburaIsland` and
  `createPlayerIsland` are already exactly that shape.
- The app arranges its panels with `dockview`, and `notations` already ships a
  `./web/dockview` integration. A drone or tala panel could follow the same
  pattern, which is also the answer to "where does it sit" in a host app.

## The entry points this repo would offer

| Export | What it holds | Depends on |
| --- | --- | --- |
| `.` | The engine: talas and their tables, exact `Ratio` time, `TempoMap`, `Sequencer`, the tala and pluck sequencers, shruthi and pitch maths, the tambura synthesis, share-link encoding | nothing |
| `./runtime` | `AudioEngine` and its buses, `Transport`, `workerTicker`, `PlayerPresenter`, `ThamburaPresenter` | a browser, no framework |
| `./mount` | `createPlayerIsland`, `createThamburaIsland`: give it an element, get a working tala or drone. Solid bundled in, so the host needs no framework | a browser |
| `./solid` | `PlayerView`, `ThamburaBar` and the four thambura views, `Knob`, `ThamburaScope`, for hosts that do use Solid | `solid-js` as a peer dependency |
| `./assets/*` | `TalasFixtures.json`, the hand images, the click sounds | served by the host |
| `./styles/*` | the built CSS for the components | nothing |

The split follows the dependency rule the code already keeps: `engine/` never
imports `player/`, and the presenters never import Solid. A consumer that only
wants to schedule Carnatic rhythm takes `.` and writes its own UI. One that
wants a working drone in a div takes `./mount`. One already on Solid takes
`./solid` and keeps control of the layout.

## What has to change first

Most of it is small, and each item is a real blocker for embedding:

1. **Asset paths.** Done in #92. `TalasFixtures.json` still names its sounds
   and images as `/static/Resources/...`, and the loader resolves them against
   the fixtures URL it was given, so on another site they stay on ours. Kits
   already resolved against their `kit.json`.
2. **CSS.** Done in #92, a third way: each island mounts in a shadow root
   holding our built `tailwind.css`, so the host's Tailwind never needs to
   scan our files and neither side's rules reach the other. The cost is dark
   mode, which can't see the host's `.dark` class from inside a shadow.
3. **One copy of Solid.** `build.mjs` already aliases `solid-js` to a single
   copy because two copies silently break reactivity. `./mount` sidesteps this
   by bundling its own; `./solid` makes it a peer dependency and leaves
   resolution to the host.
4. **Package and build layout.** A pnpm workspace with the entry points above,
   esbuild producing ESM (and CJS if a consumer needs it), `.d.ts` emitted from
   the existing strict config, and an IIFE bundle for script-tag use. The
   worker ticker already builds its worker from an inline blob, so it needs no
   bundler configuration in the host.
5. **App-only pieces stay in the app.** `KeepAwake`, the install button, the
   service worker, the goapplib page shells and the `?s=` address-bar wiring
   are this site's concerns. The presenters already take storage and link
   interfaces as dependencies, so a host can supply its own or none. `embed.js`
   (#92) is the script-tag version of this today: it leaves out the install
   button and the worker, and its thambura leaves the host's address bar alone.
   `/embed/demo` shows what a host writes, and `make test`'s build check keeps
   the page chrome out of it.

## What embedding in the notation app could look like

Worth sketching, because it decides whether the seams above are the right ones.

- **A practice bar under the notation.** The host calls `./mount` on a div (or
  a dockview panel) and passes its own `AudioContext`, so the notation's audio
  and ours share a clock and a mixer. Nothing in the presenters assumes it owns
  the context.
- **The notation sets the tala.** A kriti's notation already knows its tala and
  its speed. Mapping that to `TalaSettings` means the student presses one
  button rather than choosing Adi and 72 bpm by hand.
- **The notation follows the beat.** This is the interesting one. The tala
  emits a `StepEvent` per beat at an exact musical position on a shared
  `TempoMap`. A notation cursor could advance off the same events, so the
  score, the clicks and the hand images stay in step by construction rather
  than by two timers agreeing. That is what `TempoMap` was built for, and the
  mridangam will be the second voice on it.
- **The drone tunes to the piece.** `tunedTonicHz` already exists for the
  mridangam's benefit; a notation's key would set the shruthi the same way.

If that last point works, the library is worth extracting. Publishing `.` and
`./runtime` is enough if a drone is all the notation app ever wants, and the
Solid components can stay here.

## Open questions

- Package name and scope. `notations` is unscoped; is `thambura` free, or does
  this want `@panyam/...`?
- One package with subpath exports (like `notations`) or several small ones?
  Subpaths are simpler to release and match the precedent.
- How big is the self-mounting bundle with Solid inside, and is that
  acceptable to a host that already ships webpack chunks? Solid is small, but
  the answer decides whether `./mount` or a set of framework-free primitives
  ships first.
- How much of the Lab belongs in a library at all? It is a workbench for this
  app's synthesis, not obviously a component someone else wants.

## Related

- [layouts.md](layouts.md): where the thambura sits in this app, which is the
  same question one layer up. A host app embedding a piece is just another
  layout.
