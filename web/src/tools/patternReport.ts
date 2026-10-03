import { arrangementFor } from "../engine/arrangement";
import { PATTERNS, patternFor, type Pattern } from "../engine/patterns";
import { beatsFor, DEFAULT_SETTINGS, GATI_OPTIONS, TALA_OPTIONS, type TalaSettings } from "../engine/selection";
import { TalaGrid } from "../engine/talaGrid";

/**
 * Which talas play a written mridangam pattern and which fall back to the
 * generated skeleton: the exercise for issue #185, run as `make
 * patternreport`. It asks the engine the same question the kit does
 * (`patternFor`, then `arrangementFor`), so a row says what a student hears,
 * not what the file names suggest.
 */

/**
 * The talas the mission covers: every one in the menu, in chatusram nadai,
 * with each sapta tala at the jaathi a student usually meets. Thriputa
 * appears twice, since chatusra Thriputa is Adi's shape and thisra is its own.
 */
export const REPORT_SCOPE: TalaSettings[] = (
  [
    ["sapta_eka", "chatusram"],
    ["sapta_rupaka", "chatusram"],
    ["sapta_matya", "chatusram"],
    ["sapta_jhumpa", "misram"],
    ["sapta_thriputa", "thisram"],
    ["sapta_thriputa", "chatusram"],
    ["sapta_ata", "khandam"],
    ["sapta_dhruva", "chatusram"],
    ["chaapu_thisram", "chatusram"],
    ["chaapu_khandam", "chatusram"],
    ["chaapu_misram", "chatusram"],
    ["chaapu_vilomam", "chatusram"],
    ["chaapu_sankeernam", "chatusram"],
    ["custom_adi", "chatusram"],
    ["custom_rupakam", "chatusram"],
  ] as const
).map(([tala, jaathi]) => ({ ...DEFAULT_SETTINGS, tala, jaathi, nadai: "chatusram" }));

/** One tala's line in the report. */
export interface ReportRow {
  /** The tala as the menu names it, with its jaathi for a sapta tala. */
  tala: string;
  /** The main pattern's id, or null when the generated skeleton plays. */
  main: string | null;
  /** The main pattern's source, its first sentence. */
  source: string;
  /** How many of the main pattern's strokes play a stand-in (#80). */
  standIns: number;
  variations: number;
  korvai: boolean;
}

/** A row per setting, from `patterns` (the compiled ones unless a test passes its own). */
export function patternReport(scope: TalaSettings[] = REPORT_SCOPE, patterns: Pattern[] = PATTERNS): ReportRow[] {
  return scope.map((settings) => {
    const grid = new TalaGrid(beatsFor(settings), settings.kalai);
    const main = patternFor(grid, settings.nadai, patterns);
    const arrangement = arrangementFor(grid, settings.nadai, main, patterns);
    return {
      tala: talaName(settings),
      main: main?.id ?? null,
      source: main ? main.source.split(/\.(\s|$)/)[0].trim() : "",
      standIns: main?.strokes.filter((s) => s.standIn).length ?? 0,
      variations: arrangement?.variations.length ?? 0,
      korvai: arrangement?.korvai != null,
    };
  });
}

/**
 * The report as an aligned text table, a count of written rows, and each
 * main pattern's source below it, since a source runs too long for a column.
 */
export function formatReport(rows: ReportRow[]): string {
  const head = ["Tala", "Plays", "Stand-ins", "Variations", "Korvai"];
  const cells = rows.map((r) =>
    r.main ? [r.tala, r.main, String(r.standIns), String(r.variations), r.korvai ? "yes" : "no"] : [r.tala, "generated", "-", "-", "-"],
  );
  const widths = head.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
  const line = (c: string[]) => c.map((v, i) => v.padEnd(widths[i])).join("  ").trimEnd();
  const written = rows.filter((r) => r.main);
  const sources = new Map(written.map((r) => [r.main, r.source]));
  return [
    line(head),
    line(widths.map((w) => "-".repeat(w))),
    ...cells.map(line),
    "",
    `${written.length} of ${rows.length} written`,
    ...(sources.size ? ["", "Sources:", ...[...sources].map(([id, source]) => `  ${id}: ${source}`)] : []),
  ].join("\n");
}

function talaName(s: TalaSettings): string {
  const name = TALA_OPTIONS.flatMap((g) => g.options).find((o) => o.value === s.tala)?.label ?? s.tala;
  if (!s.tala.startsWith("sapta_")) return name;
  return `${name} (${GATI_OPTIONS.find((g) => g.value === s.jaathi)?.label ?? s.jaathi})`;
}
