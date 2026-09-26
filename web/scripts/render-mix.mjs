// Renders the thambura's plucked modes offline to WAV, with a JSON of what
// was played when, for listening and for tools/sound-analysis. See
// docs/designs/sound-analysis.md.
//
//   pnpm render-mix [--modes jawari,tambura,guitar] [--key C3] [--cycle 5.8]
//                   [--seconds 30] [--rate 44100] [--tone 50] [--pluck 50]
//                   [--sustain 60] [--voice gents] [--out ../recordings/renders]
//                   [--custom lab.json]
//
// --custom plays the Lab view's "Copy settings" JSON; with it, --modes
// defaults to custom.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values: opt } = parseArgs({
  options: {
    modes: { type: "string" },
    custom: { type: "string" },
    key: { type: "string", default: "C3" },
    cycle: { type: "string", default: "5.8" },
    seconds: { type: "string", default: "30" },
    rate: { type: "string", default: "44100" },
    tone: { type: "string" },
    pluck: { type: "string" },
    sustain: { type: "string" },
    voice: { type: "string" },
    out: { type: "string", default: join(web, "..", "recordings", "renders") },
  },
});

// Bundle the TypeScript engine for node in memory, then import it.
const bundle = await build({
  stdin: {
    contents: `export { mixThambura } from "./src/tools/thamburaMix";
               export { normalizePlan, planFor } from "./src/engine/thamburaPlan";
               export { DEFAULT_THAMBURA, KEYS, normalizeThambura } from "./src/engine/shruthi";`,
    resolveDir: web,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "error",
});
const lib = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

const key = lib.KEYS.findIndex((k) => `${k.note}${k.octave}` === opt.key);
if (key < 0) throw new Error(`unknown key ${opt.key}; use e.g. C3, G#2, B3`);
const rate = Number(opt.rate);
mkdirSync(opt.out, { recursive: true });
const custom = opt.custom
  ? lib.normalizePlan(JSON.parse(readFileSync(opt.custom, "utf8")), lib.planFor({ ...lib.DEFAULT_THAMBURA, mode: "jawari" }))
  : undefined;
const modes = opt.modes ?? (custom ? "custom" : "jawari,tambura,guitar");

for (const mode of modes.split(",")) {
  const s = lib.normalizeThambura({
    ...lib.DEFAULT_THAMBURA,
    key,
    mode,
    cycleSeconds: Number(opt.cycle),
    ...(opt.tone && { tone: Number(opt.tone) }),
    ...(opt.pluck && { pluck: Number(opt.pluck) }),
    ...(opt.sustain && { sustain: Number(opt.sustain) }),
    ...(opt.voice && { voice: opt.voice }),
  });
  const m = lib.mixThambura(s, Number(opt.seconds), rate, 1, custom);
  const base = join(opt.out, mode);
  writeFileSync(`${base}.wav`, wav(m.left, m.right, rate));
  writeFileSync(
    `${base}.json`,
    JSON.stringify({ mode, settings: s, sampleRate: rate, frequencies: m.frequencies, events: m.events }, null, 1),
  );
  const plucks = m.events.filter((e) => !("damp" in e)).length;
  console.log(`${base}.wav  ${s.mode}, ${opt.key}, ${s.cycleSeconds} s round, ${plucks} plucks`);
}

/** 16-bit stereo PCM. */
function wav(left, right, rate) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  const pcm = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(pcm(left[i]), 44 + i * 4);
    buf.writeInt16LE(pcm(right[i]), 46 + i * 4);
  }
  return buf;
}
