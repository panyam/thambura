# Stackfile

> Tracks which stack components this project uses and at what version.
> Updated by `/stack-update` or manually.

## Stack Components

| Component | Module | Version | Updated |
|-----------|--------|---------|---------|
| goapplib | github.com/panyam/goapplib | v0.1.1 | 2026-09-18 |
| goapplib templates | github.com/panyam/goapplib (templar source, `web/templates/templar.yaml`) | v0.1.1 | 2026-09-18 |
| templar | github.com/panyam/templar | v0.1.2 | 2026-09-18 |
| goutils | github.com/panyam/goutils | v0.1.13 (indirect) | 2026-09-18 |
| tsappkit (TS) | @panyam/tsappkit | 0.0.5 | 2026-09-18 |
| tsappkit-solid (TS) | @panyam/tsappkit-solid | 0.0.1 | 2026-09-18 |
| s3gen | github.com/panyam/s3gen (`docs/go.mod` only) | v0.1.6 | 2026-09-26 |

goapplib + templar render the page shell (BasePage, header, theme toggle).
tsappkit's `BasePage` wires the toggle, and tsappkit-solid's `SolidIsland` and
`signalView` mount the player. This follows the goapplib + Solid pattern
diffpp uses.

s3gen builds the developer docs site (`docs/`, #95) in its own Go module, so
it never reaches the app's build or its App Engine upload.

Built here to be lifted into the stack (#86): `internal/page` and the page
spec partial into goapplib (panyam/goapplib#28, planned as `v0.2.0`),
`web/src/page` into tsappkit (panyam/goapplib#27, `0.1.0`), and maybe the
esbuild splitting and preload setup as a shared preset (panyam/goapplib#29).
`make liftcheck` keeps the first two free of thambura imports. Update the
table above when they land.

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
