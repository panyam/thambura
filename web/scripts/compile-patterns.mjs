/**
 * Compiles the patterns in web/patterns/*.not into src/engine/patterns.data.ts.
 *
 * Patterns are written in the notations DSL (panyam/notations), the same
 * format the notation app reads, so a pattern is reviewable as music and can
 * be rendered elsewhere. The parser runs here rather than in the browser: it
 * bundles to 78 KB gzipped, which is half the app again, and compiling early
 * turns a miscounted pattern into a build failure instead of a silence.
 *
 * The compiling itself is patterns.mjs, and a sol: line's realization
 * realize.mjs; this reads the tables and the files, and writes the output.
 *
 *   pnpm patterns     # rewrite the generated file
 *   pnpm patterns -c  # check it matches, for CI and the drift test
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePattern, renderPatterns } from "./patterns.mjs";
import { phraseTable } from "./realize.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const patternsDir = join(here, "..", "patterns");
const outFile = join(here, "..", "src", "engine", "patterns.data.ts");
const json = (path) => JSON.parse(readFileSync(path, "utf8"));

const { strokes: words, letters } = json(join(patternsDir, "strokes.json"));
const syllables = json(join(here, "..", "src", "engine", "syllables.data.json"));
const table = phraseTable(json(join(patternsDir, "realize", "mridangam.json")).phrases, { syllables, letters });
const tables = { words, letters, syllables, table };

// Fail on the first bad file: after one failure the parser reports that same
// error for every later load in the process (notations#22), so carrying on
// would blame the wrong file.
const files = readdirSync(patternsDir).filter((f) => f.endsWith(".not")).sort();
const compiled = files.map((f) => compilePattern(readFileSync(join(patternsDir, f), "utf8"), f, tables));
const text = renderPatterns(compiled);

if (process.argv.includes("-c") || process.argv.includes("--check")) {
  const current = readFileSync(outFile, "utf8");
  if (current !== text) {
    console.error("patterns.data.ts is out of date; run `pnpm patterns`");
    process.exit(1);
  }
  console.log(`patterns up to date: ${compiled.length} pattern(s)`);
} else {
  writeFileSync(outFile, text);
  console.log(`wrote ${outFile}: ${compiled.map((p) => `${p.id} (${p.strokes.length} strokes)`).join(", ")}`);
}
