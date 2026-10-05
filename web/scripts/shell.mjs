// What the service worker precaches (src/sw.ts), worked out from the build.
// Every script esbuild wrote is listed, lazy chunks included, so a visitor
// who has been here once can open any view offline, and a returning visitor's
// old worker always holds an app.js and the chunks that app.js asks for.

/**
 * The precache list: `extras` first (pages and files the build doesn't write,
 * such as "/" and the CSS), then every .js and .css output under `outdir`, as
 * URLs under `base`, sorted. Source maps are left out.
 *
 * @param {{ outputs: Record<string, unknown> }} metafile esbuild's metafile
 * @param {{ outdir: string, base: string, extras: string[] }} opts
 * @returns {string[]}
 */
export function shellFor(metafile, { outdir, base, extras }) {
  const dir = outdir.replace(/^\.\//, "").replace(/\/$/, "") + "/";
  const built = Object.keys(metafile.outputs)
    .map((p) => p.replace(/^\.\//, ""))
    .filter((p) => p.startsWith(dir) && /\.(js|css)$/.test(p))
    .map((p) => `${base}/${p.slice(dir.length)}`)
    .sort();
  return [...new Set([...extras, ...built])];
}
