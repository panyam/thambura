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

/**
 * The chunks an entry imports before it can run, directly or through other
 * chunks, as URLs under `base`: what a page should ask for with
 * <link rel="modulepreload"> so the browser fetches them alongside the entry
 * instead of one after another. Chunks loaded with import() are left out, as
 * is the entry itself (the page's own <script> fetches it). An entry the
 * build didn't write has none.
 *
 * @param {{ outputs: Record<string, { imports?: { path: string, kind: string }[] }> }} metafile
 * @param {string} entry the entry's name, e.g. "app" for static/app.js
 * @param {{ outdir: string, base: string }} opts
 * @returns {string[]}
 */
export function preloadFor(metafile, entry, { outdir, base }) {
  const dir = outdir.replace(/^\.\//, "").replace(/\/$/, "") + "/";
  const outputs = Object.fromEntries(Object.entries(metafile.outputs).map(([p, v]) => [p.replace(/^\.\//, ""), v]));
  const seen = new Set();
  const visit = (path) => {
    for (const imp of outputs[path]?.imports ?? []) {
      const p = imp.path.replace(/^\.\//, "");
      if (imp.kind !== "import-statement" || seen.has(p)) continue;
      seen.add(p);
      visit(p);
    }
  };
  visit(`${dir}${entry}.js`);
  return [...seen].filter((p) => p.startsWith(dir)).map((p) => `${base}/${p.slice(dir.length)}`).sort();
}
