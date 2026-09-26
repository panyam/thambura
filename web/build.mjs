import { execSync } from "child_process";
import { rmSync, writeFileSync } from "fs";
import { relative, resolve } from "path";
import { build, context } from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";
import { createRequire } from "module";
import { preloadFor, shellFor } from "./scripts/shell.mjs";

const require = createRequire(import.meta.url);

// Pin a single Solid reactive core. Two copies of solid-js (ours and the one
// tsappkit-solid resolves) make signals set in one invisible to the other.
const solidAlias = {
  "solid-js": require.resolve("solid-js/dist/solid.js"),
  "solid-js/web": require.resolve("solid-js/web/dist/web.js"),
  "solid-js/store": require.resolve("solid-js/store/dist/store.js"),
};

// Where the bundles go. scripts/check-build.mjs builds into a temp folder.
const at = process.argv.indexOf("--outdir");
const outdir = at > 0 ? process.argv[at + 1] : "static";
// The bundle manifest Go reads at startup (internal/web/bundle.go): the chunks
// each entry imports before it runs, which the pages preload so the browser
// fetches them alongside app.js rather than one after another. It sits
// outside static/, because App Engine serves that folder from its own static
// servers and the Go app can't read files there.
const mat = process.argv.indexOf("--manifest");
const manifest = mat > 0 ? process.argv[mat + 1] : "bundle.json";

// app.js keeps its name (the templates, the service worker and the live-build
// check in CLAUDE.md all name it). Code loaded on first use, such as the Lab
// and Raagini views, goes into content-hashed chunks, which app.yaml lets
// browsers keep for a long time since a name never changes its content.
const options = {
  entryPoints: { app: "src/main.ts" },
  outdir,
  bundle: true,
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  metafile: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
  alias: solidAlias,
  plugins: [solidPlugin()],
  logLevel: "info",
};

// The service worker is its own bundle: it runs outside the page, and as a
// classic script, which every browser supports (module workers need Safari
// 16.4+). Its cache is named after the build, so a deploy replaces it.
const build_id = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return String(Date.now());
  }
})();

// Everything the service worker precaches: the page, the CSS and fixtures,
// and every script the app build wrote (scripts/shell.mjs).
const SHELL_EXTRAS = ["/", "/static/app.js", "/static/css/tailwind.css", "/static/Resources/TalasFixtures.json"];

const swOptions = (metafile) => ({
  entryPoints: { sw: "src/sw.ts" },
  outdir,
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  sourcemap: false,
  define: {
    __BUILD__: JSON.stringify(build_id),
    // The metafile's paths are relative to the working directory.
    __SHELL__: JSON.stringify(shellFor(metafile, { outdir: relative(process.cwd(), resolve(outdir)), base: "/static", extras: SHELL_EXTRAS })),
  },
  logLevel: "info",
});

function writeManifest(metafile) {
  const rel = relative(process.cwd(), resolve(outdir));
  const app = { script: "/static/app.js", preload: preloadFor(metafile, "app", { outdir: rel, base: "/static" }) };
  writeFileSync(manifest, JSON.stringify({ app }, null, 2) + "\n");
}

// esbuild never deletes, so chunks from earlier builds would pile up and be
// deployed. Nothing else lives in chunks/.
rmSync(`${outdir}/chunks`, { recursive: true, force: true });

if (process.argv.includes("--watch")) {
  // The worker is built once from the first app build; a reload after a
  // rebuild still works, since pages and missing assets go to the network.
  const ctx = await context(options);
  // A rebuild renames the chunks, so the manifest the server read at startup
  // goes stale: a preload then misses, which costs nothing, since app.js asks
  // for the right chunk anyway. Restart the server to pick up the new one.
  const first = await ctx.rebuild();
  writeManifest(first.metafile);
  await ctx.watch();
  const swCtx = await context(swOptions(first.metafile));
  await swCtx.watch();
} else {
  const app = await build(options);
  writeManifest(app.metafile);
  await build(swOptions(app.metafile));
}
