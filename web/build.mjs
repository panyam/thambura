import { execSync } from "child_process";
import { build, context } from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Pin a single Solid reactive core. Two copies of solid-js (ours and the one
// tsappkit-solid resolves) make signals set in one invisible to the other.
const solidAlias = {
  "solid-js": require.resolve("solid-js/dist/solid.js"),
  "solid-js/web": require.resolve("solid-js/web/dist/web.js"),
  "solid-js/store": require.resolve("solid-js/store/dist/store.js"),
};

const options = {
  entryPoints: { app: "src/main.ts" },
  outdir: "static",
  bundle: true,
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

const swOptions = {
  entryPoints: { sw: "src/sw.ts" },
  outdir: "static",
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  sourcemap: false,
  define: { __BUILD__: JSON.stringify(build_id) },
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
  const swCtx = await context(swOptions);
  await swCtx.watch();
} else {
  await build(options);
  await build(swOptions);
}
