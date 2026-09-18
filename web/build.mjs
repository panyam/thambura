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

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
