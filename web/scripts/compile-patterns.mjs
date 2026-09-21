/**
 * Compiles the patterns in web/patterns/*.not into src/engine/patterns.data.ts.
 *
 * Patterns are written in the notations DSL (panyam/notations), the same
 * format the notation app reads, so a pattern is reviewable as music and can
 * be rendered elsewhere. The parser runs here rather than in the browser: it
 * bundles to 78 KB gzipped, which is half the app again, and compiling early
 * turns a miscounted pattern into a build failure instead of a silence.
 *
 * What comes out is what the app already understood: strokes at exact
 * fractional positions, counted in beats of the cycle.
 *
 *   pnpm patterns     # rewrite the generated file
 *   pnpm patterns -c  # check it matches, for CI and the drift test
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The CJS build: notations' ESM build imports without file extensions, which
// Node's ESM loader won't resolve (notations#20).
const N = createRequire(import.meta.url)("notations");

const here = dirname(fileURLToPath(import.meta.url));
const patternsDir = join(here, "..", "patterns");
const outFile = join(here, "..", "src", "engine", "patterns.data.ts");

/** The file's front matter, which the parser hands back already parsed. */
function frontMatter(notation) {
  const meta = {};
  for (const [key, entry] of notation.metadata) meta[key] = entry.value;
  return meta;
}

/** Every atom of every role, in time order, with its offset in atom units. */
function atoms(notation) {
  const out = [];
  for (const block of notation.blocks) {
    if (block.constructor.name !== "Line") continue;
    for (const role of block.roles) {
      const it = new N.AtomIterator(...role.atoms);
      for (;;) {
        const next = it.next();
        const flat = next && next.value !== undefined ? next.value : next;
        if (!flat || !flat.atom) break;
        out.push({ role: role.name, atom: flat.atom, offset: flat.offset, duration: flat.duration });
      }
    }
  }
  return out;
}

function compile(file, strokes) {
  const source = readFileSync(join(patternsDir, file), "utf8");
  const [notation, , errors] = N.load(source);
  if (errors.length > 0) throw new Error(`${file}: ${errors.map(String).join("; ")}`);
  const meta = frontMatter(notation);

  const line = notation.blocks.find((b) => b.constructor.name === "Line");
  if (!line) throw new Error(`${file}: no notation lines`);
  const perBeat = line.layoutParams.beatDuration;
  const cycleCounts = Number(line.layoutParams.cycle.duration.num) / Number(line.layoutParams.cycle.duration.den);

  const events = [];
  let total = 0;
  for (const { atom, offset, duration } of atoms(notation)) {
    total += Number(duration.num) / Number(duration.den);
    const name = atom.value;
    // A Space is a rest, and takes its time without playing anything.
    if (!name) continue;
    const stroke = strokes[name];
    if (!stroke) throw new Error(`${file}: no stroke for "${name}" (add it to patterns/strokes.json)`);
    // Atom offsets count atoms, and a cycle holds beatDuration of them per
    // beat, so this is the stroke's fraction of the whole cycle.
    events.push({
      n: Number(offset.num),
      d: Number(offset.den) * perBeat * cycleCounts,
      stroke,
      gain: meta.accents?.[String(Math.floor(Number(offset.num) / Number(offset.den) / perBeat))] ?? 1,
      akshara: Math.floor(Number(offset.num) / Number(offset.den) / perBeat),
    });
  }

  const beats = total / perBeat;
  if (beats !== cycleCounts) {
    throw new Error(`${file}: the line fills ${beats} beats, but its cycle is ${cycleCounts}`);
  }
  if (meta.counts === undefined) {
    throw new Error(`${file}: no counts in the front matter (how many counts is the tala's cycle?)`);
  }
  if (!meta.source) {
    throw new Error(`${file}: no source in the front matter (who wrote this pattern, and has a player checked it?)`);
  }
  // The shape is the app's own name for the cycle (its beat images), which a
  // chaapu writes as one beat while its pattern is written per akshara. So
  // the shape is not checked against the DSL's cycle, only that it is there.
  const shapeBeats = meta.shape.trim().split(/\s+/).length;

  const [countsN, countsD] = String(meta.counts).split("/");
  return {
    id: meta.id,
    name: meta.name,
    source: meta.source,
    counts: [Number(countsN), Number(countsD ?? 1)],
    // The DSL's cycle is the musical one: seven aksharas for a misra chaapu,
    // where the app's tables call it a single beat.
    aksharas: cycleCounts,
    shape: meta.shape,
    nadai: meta.nadai,
    beats: shapeBeats,
    strokes: events,
  };
}

function render(patterns) {
  const body = patterns
    .map(
      (p) => `  {
    id: ${JSON.stringify(p.id)},
    name: ${JSON.stringify(p.name)},
    source: ${JSON.stringify(p.source)},
    shape: ${JSON.stringify(p.shape)},
    counts: ratio(${p.counts[0]}, ${p.counts[1]}),
    aksharas: ${p.aksharas},
    nadai: ${JSON.stringify(p.nadai)},
    beats: ${p.beats},
    strokes: [
${p.strokes.map((s) => `      { at: ratio(${s.n}, ${s.d}), stroke: ${JSON.stringify(s.stroke)}, gain: ${s.gain} },`).join("\n")}
    ],
  },`,
    )
    .join("\n");

  return `// Generated by scripts/compile-patterns.mjs from web/patterns/*.not.
// Edit the .not files, then run \`pnpm patterns\`.
import { ratio } from "./ratio";
import type { Pattern } from "./patterns";

export const PATTERNS: Pattern[] = [
${body}
];
`;
}

const strokes = JSON.parse(readFileSync(join(patternsDir, "strokes.json"), "utf8")).strokes;
// Fail on the first bad file: after one failure the parser reports that same
// error for every later load in the process (notations#22), so carrying on
// would blame the wrong file.
const files = readdirSync(patternsDir).filter((f) => f.endsWith(".not")).sort();
const compiled = files.map((f) => compile(f, strokes));
const text = render(compiled);

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
