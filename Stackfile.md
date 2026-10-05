# Stackfile

> Tracks which stack components this project uses and at what version.
> Updated by `/stack-update` or manually.

## Stack Components

| Component | Module | Version | Updated |
|-----------|--------|---------|---------|
| goapplib | github.com/panyam/goapplib | v0.6.3 | 2026-10-05 |
| goapplib templates | github.com/panyam/goapplib (templar source, `web/templates/templar.yaml`) | v0.6.3 | 2026-10-05 |
| templar | github.com/panyam/templar | v0.1.2 | 2026-09-18 |
| goutils | github.com/panyam/goutils | v0.1.14 (indirect) | 2026-10-04 |
| tsappkit (TS) | @panyam/tsappkit | 0.6.3 | 2026-10-05 |
| tsappkit-solid (TS) | @panyam/tsappkit-solid | 0.6.3 | 2026-10-05 |
| s3gen | github.com/panyam/s3gen (`docs/go.mod` only) | v0.1.6 | 2026-09-26 |

goapplib + templar render the page shell (BasePage, header, theme toggle).
tsappkit's `BasePage` wires the toggle, and tsappkit-solid's `SolidIsland` and
`signalView` mount the player. This follows the goapplib + Solid pattern
diffpp uses.

s3gen builds the developer docs site (`docs/`, #95) in its own Go module, so
it never reaches the app's build or its App Engine upload.

Lifted into the stack (#86): the page spec's Go half is goapplib's `page`
package and `page/Islands.html` partial (panyam/goapplib#30, `v0.2.0`), which
`internal/web/spec.go` extends with thambura's instruments. The browser half
is tsappkit's `IslandPage`, `readSpec` and `mountIslands` (panyam/goapplib#27,
`@panyam/tsappkit` `0.1.0`); `web/src/player/spec.ts` reads the instruments
through `readExtension`. Still here: `web/src/page`, now only the embed
helpers (`hostSpec`, `shadowSlot`), which `make liftcheck` keeps free of
thambura imports for panyam/goapplib#44; goapplib#28 (layout variants, labs
and SEO helpers) waits for lilbattle; and maybe the esbuild splitting and
preload setup as a shared preset (panyam/goapplib#29).

From v0.6.0 (#202) goapplib, tsappkit and tsappkit-solid share one version.
Since #204 every island is a `lazy` registry entry, its own chunk, and
`internal/web/assets.go` reads esbuild's metafile with `page.LoadEsbuildMetafile`
and preloads `page.Assets.For(entry, spec)`, replacing our own bundle
manifest. The pages still write the links themselves from a `Preload` list
rather than through the `IslandPreloads` partial. `embed.ts` mounts through
`mountIslands` with `onMount`/`onSkip` (`web/src/page/mountAll.ts`), and a
test runs `page.CheckIslands` over every page's spec.

## Third-Party Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| solid-js | ^1.9 | Player UI |
| tailwindcss + @tailwindcss/forms | ^3.4 / ^0.5 | Styling, `darkMode: 'class'` |
| esbuild + esbuild-plugin-solid | ^0.28 / ^0.6 | Bundling |
| vitest | ^5.0 | Engine and presenter tests (bumped by Dependabot, PR #3) |
| notations (dev) | ^1.0.9 | The DSL mridangam patterns are written in (panyam/notations). Build time only: `pnpm patterns` compiles `web/patterns/*.not` into `src/engine/patterns.data.ts`, so the parser never reaches the browser, where it would cost 78 KB gzipped |
| numpy, scipy, soundfile, matplotlib (Python) | `tools/sound-analysis/requirements.txt` | Measuring recordings against offline renders (docs/designs/sound-analysis.md); a venv in the tool's folder, never shipped |

## Project Conventions

- **grpc**: none (no server-side data)
- **replace-pattern**: locallinks (none active)
- **frontend**: goapplib page shells + Solid islands, Tailwind dark/light
- **proto-build**: none
- **wasm**: no
