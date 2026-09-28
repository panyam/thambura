/**
 * Turns a pattern's sol: line into strokes (docs/designs/solkattu.md).
 *
 * A phrase table maps runs of syllables to stroke letters, and a letter to a
 * stroke in the kit. The longest phrase that matches wins, and a pattern's own
 * phrases beat the instrument's table. Anything unmatched is an error: a
 * wrong stroke played confidently is worse than a build that stops.
 *
 * Pure, so vitest checks it (realize.test.mjs); compile-patterns.mjs does the
 * file reading.
 */

/**
 * A phrase table, checked: every syllable known (an alias is filed under its
 * id), every letter in the letters table, and as many strokes as syllables.
 *
 * `phrases` maps "ta ka" to "k p", with `_` for a rest on either side.
 * `syllables` is the app's syllable table ({id, aliases}); `letters` maps a
 * letter to a stroke id, or to {stroke, gain, standIn} for a stroke the kit
 * has no take for. Throws on the first bad entry.
 */
export function phraseTable(phrases, { syllables, letters }) {
  const ids = new Map();
  for (const s of syllables) for (const spelling of [s.id, ...s.aliases]) ids.set(spelling, s.id);

  const entries = Object.entries(phrases).map(([said, played]) => {
    const key = said.trim().split(/\s+/).map((spelling) => {
      if (spelling === "_") return null;
      const id = ids.get(spelling.toLowerCase());
      if (!id) throw new Error(`phrase "${said}": unknown syllable "${spelling}"`);
      return id;
    });
    const strokes = played.trim().split(/\s+/).map((letter) => {
      if (letter === "_") return null;
      const entry = letters[letter];
      if (!entry) throw new Error(`phrase "${said}": unknown letter "${letter}"`);
      return typeof entry === "string" ? { stroke: entry, gain: 1 } : { stroke: entry.stroke, gain: entry.gain, standIn: entry.standIn };
    });
    if (key.length !== strokes.length) {
      throw new Error(`phrase "${said}" has ${key.length} syllables but "${played}" has ${strokes.length} stroke${strokes.length === 1 ? "" : "s"}`);
    }
    return { key, strokes };
  });
  // Longest first, so the first match found is the longest.
  entries.sort((a, b) => b.key.length - a.key.length);
  return { entries, ids };
}

/**
 * Realizes a line of syllables, in time order, `null` for a rest. Returns the
 * syllable ids and, slot for slot, the stroke played there or `null`. A
 * stroke is {stroke, gain} plus `standIn` when it plays in place of one the
 * kit lacks.
 */
export function realize(spellings, { table, overrides }) {
  const syllables = spellings.map((spelling, i) => {
    if (spelling === null) return null;
    const id = table.ids.get(spelling.toLowerCase());
    if (!id) throw new Error(`unknown syllable "${spelling}" at syllable ${i + 1}`);
    return id;
  });

  const strokes = [];
  let i = 0;
  while (i < syllables.length) {
    if (syllables[i] === null) {
      strokes.push(null);
      i++;
      continue;
    }
    const match = [overrides, table]
      .filter(Boolean)
      .flatMap((t) => t.entries)
      .find((e) => e.key.every((id, k) => syllables[i + k] === id));
    if (!match) throw new Error(`no realization for "${syllables[i]}" at syllable ${i + 1} (add it to the phrase table or the pattern's realize:)`);
    strokes.push(...match.strokes);
    i += match.key.length;
  }
  return { syllables, strokes };
}
