/**
 * Compiles one pattern file's text (web/patterns/*.not) into what the app
 * plays: strokes at exact fractions of the cycle, and the solkattu to show.
 *
 * A pattern has up to two roles. `mrid:` names strokes in words
 * (patterns/strokes.json). `sol:` is solkattu, realized into strokes through
 * the phrase table (realize.mjs) when there's no `mrid:` line, and kept
 * beside it for display when there is (docs/designs/solkattu.md).
 *
 * Pure over the text and the tables, so vitest checks it (patterns.test.mjs);
 * compile-patterns.mjs reads the files and writes patterns.data.ts.
 */

import { createRequire } from "node:module";
import { phraseTable, realize } from "./realize.mjs";

// The CJS build: notations' ESM build imports without file extensions, which
// Node's ESM loader won't resolve (notations#20).
const N = createRequire(import.meta.url)("notations");

const ROLES = ["mrid", "sol"];

/** The file's front matter, which the parser hands back already parsed. */
function frontMatter(notation) {
  const meta = {};
  for (const [key, entry] of notation.metadata) meta[key] = entry.value;
  return meta;
}

/** Each role's atoms in time order, with offsets in atom units. Roles run side by side from the line's start. */
function atomsByRole(notation) {
  const out = new Map();
  for (const block of notation.blocks) {
    if (block.constructor.name !== "Line") continue;
    for (const role of block.roles) {
      const list = out.get(role.name) ?? [];
      const it = new N.AtomIterator(...role.atoms);
      for (;;) {
        const next = it.next();
        const flat = next && next.value !== undefined ? next.value : next;
        if (!flat || !flat.atom) break;
        list.push({ atom: flat.atom, offset: flat.offset, duration: flat.duration });
      }
      out.set(role.name, list);
    }
  }
  return out;
}

const round = (x) => Math.round(x * 1000) / 1000;

/**
 * One pattern, compiled. `tables` holds `words` (a mrid: token, lowercased,
 * to a stroke id or a {stroke, gain, standIn} stand-in), `letters` and `syllables` (for a pattern's own realize: phrases), and
 * `table`, the instrument's phrase table from phraseTable(). Throws, naming
 * the file, on anything that would otherwise play wrong or not at all.
 */
export function compilePattern(source, file, tables) {
  const [notation, , errors] = N.load(source);
  if (errors.length > 0) throw new Error(`${file}: ${errors.map(String).join("; ")}`);
  const meta = frontMatter(notation);

  const line = notation.blocks.find((b) => b.constructor.name === "Line");
  if (!line) throw new Error(`${file}: no notation lines`);
  const perBeat = line.layoutParams.beatDuration;
  const cycleCounts = Number(line.layoutParams.cycle.duration.num) / Number(line.layoutParams.cycle.duration.den);

  const roles = atomsByRole(notation);
  for (const name of roles.keys()) {
    if (!ROLES.includes(name)) throw new Error(`${file}: unknown role "${name}" (a pattern has ${ROLES.map((r) => `${r}:`).join(" and ")})`);
  }
  if (roles.size === 0) throw new Error(`${file}: no mrid: or sol: line`);
  for (const [name, atoms] of roles) {
    const beats = atoms.reduce((sum, a) => sum + Number(a.duration.num) / Number(a.duration.den), 0) / perBeat;
    if (beats !== cycleCounts) throw new Error(`${file}: the ${name}: line fills ${beats} beats, but its cycle is ${cycleCounts}`);
  }

  // Atom offsets count atoms, and a cycle holds beatDuration of them per
  // beat, so this is a fraction of the whole cycle.
  const place = (offset) => ({ n: Number(offset.num), d: Number(offset.den) * perBeat * cycleCounts });
  const aksharaOf = (offset) => Math.floor(Number(offset.num) / Number(offset.den) / perBeat);
  const accent = (akshara) => meta.accents?.[String(akshara)] ?? 1;

  let solkattu;
  let realized;
  const sol = roles.get("sol");
  if (sol) {
    const overrides = meta.realize ? phraseTable(meta.realize, tables) : undefined;
    try {
      realized = realize(
        sol.map((a) => a.atom.value ?? null),
        { table: tables.table, overrides },
      );
    } catch (e) {
      const at = /at syllable (\d+)/.exec(e.message);
      const where = at ? `, akshara ${aksharaOf(sol[Number(at[1]) - 1].offset) + 1}` : "";
      throw new Error(`${file}${where}: ${e.message}`);
    }
    solkattu = sol.flatMap((a, i) => (realized.syllables[i] ? [{ ...place(a.offset), syllable: realized.syllables[i] }] : []));
  }

  const events = [];
  const mrid = roles.get("mrid");
  if (mrid) {
    for (const { atom, offset } of mrid) {
      const name = atom.value;
      // A Space is a rest, and takes its time without playing anything.
      if (!name) continue;
      const entry = tables.words[name.toLowerCase()];
      if (!entry) {
        const why = name.includes("+") ? ": it would take two strokes at once, which a pattern can't play yet" : " (add it to patterns/strokes.json)";
        throw new Error(`${file}: no stroke for "${name}"${why}`);
      }
      const word = typeof entry === "string" ? { stroke: entry, gain: 1 } : entry;
      const event = { ...place(offset), stroke: word.stroke, gain: round(accent(aksharaOf(offset)) * word.gain) };
      if (word.standIn) event.standIn = true;
      events.push(event);
    }
  } else {
    sol.forEach((a, i) => {
      const s = realized.strokes[i];
      if (!s) return;
      const event = { ...place(a.offset), stroke: s.stroke, gain: round(accent(aksharaOf(a.offset)) * s.gain) };
      if (s.standIn) event.standIn = true;
      events.push(event);
    });
  }

  if (meta.counts === undefined) {
    throw new Error(`${file}: no counts in the front matter (how many counts is the tala's cycle?)`);
  }
  if (!meta.source) {
    throw new Error(`${file}: no source in the front matter (who wrote this pattern, and has a player checked it?)`);
  }
  // A chaapu's pattern plays on any nadai, so its ticks are what tell it from
  // another chaapu of the same length (Misra and Viloma are both seven).
  if (meta.nadai === "any" && meta.ticks === undefined) {
    throw new Error(`${file}: no ticks in the front matter (where do the chaapu's claps fall? e.g. "0 1/7 3/7 5/7")`);
  }
  // The shape is the app's own name for the cycle (its beat images), which a
  // chaapu writes as one beat while its pattern is written per akshara. So
  // the shape is not checked against the DSL's cycle, only that it is there.
  const shapeBeats = meta.shape.trim().split(/\s+/).length;

  const [countsN, countsD] = String(meta.counts).split("/");
  const out = {
    id: meta.id,
    name: meta.name,
    source: meta.source,
    counts: [Number(countsN), Number(countsD ?? 1)],
    role: meta.role === "variation" || meta.role === "korvai" ? meta.role : "main",
    // The DSL's cycle is the musical one: seven aksharas for a misra chaapu,
    // where the app's tables call it a single beat.
    aksharas: cycleCounts,
    shape: meta.shape,
    nadai: meta.nadai,
    beats: shapeBeats,
    strokes: events,
  };
  if (meta.ticks !== undefined) out.ticks = normalizeTicks(String(meta.ticks));
  if (solkattu) out.solkattu = solkattu;
  return out;
}

/** Ticks as `TalaGrid.ticks` writes them: each fraction in lowest terms, beats split by "|". */
function normalizeTicks(text) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  return text
    .split("|")
    .map((beat) =>
      beat
        .trim()
        .split(/\s+/)
        .map((t) => {
          const [n, d = 1] = t.split("/").map(Number);
          const g = gcd(n, d) || 1;
          return d / g === 1 ? `${n / g}` : `${n / g}/${d / g}`;
        })
        .join(" "),
    )
    .join("|");
}

/** patterns.data.ts's text for the compiled patterns. */
export function renderPatterns(patterns) {
  const body = patterns
    .map(
      (p) => `  {
    id: ${JSON.stringify(p.id)},
    name: ${JSON.stringify(p.name)},
    source: ${JSON.stringify(p.source)},
    shape: ${JSON.stringify(p.shape)},
    counts: ratio(${p.counts[0]}, ${p.counts[1]}),
    aksharas: ${p.aksharas},
    nadai: ${JSON.stringify(p.nadai)},${p.ticks ? `
    ticks: ${JSON.stringify(p.ticks)},` : ""}
    role: ${JSON.stringify(p.role)},
    beats: ${p.beats},
    strokes: [
${p.strokes.map((s) => `      { at: ratio(${s.n}, ${s.d}), stroke: ${JSON.stringify(s.stroke)}, gain: ${s.gain}${s.standIn ? ", standIn: true" : ""} },`).join("\n")}
    ],${
      p.solkattu
        ? `
    solkattu: [
${p.solkattu.map((s) => `      { at: ratio(${s.n}, ${s.d}), syllable: ${JSON.stringify(s.syllable)} },`).join("\n")}
    ],`
        : ""
    }
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

