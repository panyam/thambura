// Times `PluckRender` on its own, outside the browser, so every change to it
// can be measured (issue #36). It renders what the presenter renders: all
// four strings of a plucked mode, at the default settings.
//
//   pnpm bench [--mode jawari] [--rate 48000] [--runs 6]
//
// Nanoseconds per harmonic-sample is the number to compare across machines
// and voices; milliseconds only say what this machine did today.
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values: opt } = parseArgs({
  options: {
    mode: { type: "string" },
    rate: { type: "string", default: "48000" },
    runs: { type: "string", default: "6" },
  },
});

// Bundle the TypeScript engine for node in memory, then import it.
const bundle = await build({
  stdin: {
    contents: `export { PluckRender, pluckVoice } from "./src/engine/tambura";
               export { DEFAULT_THAMBURA, stringFrequencies } from "./src/engine/shruthi";`,
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

const rate = Number(opt.rate);
const runs = Math.max(2, Number(opt.runs));
const modes = opt.mode ? [opt.mode] : ["jawari", "tambura", "guitar"];

for (const mode of modes) {
  const s = { ...lib.DEFAULT_THAMBURA, mode };
  const hz = lib.stringFrequencies(s);
  const times = [];
  let work = 0;
  for (let run = 0; run < runs; run++) {
    const t0 = process.hrtime.bigint();
    work = 0;
    for (let i = 0; i < hz.length; i++) {
      // As `thamburaPresenter` does it: one render per string, seeded by its
      // index, stepped to the end and scaled.
      const render = new lib.PluckRender(hz[i], rate, lib.pluckVoice(s, i), i + 1);
      work += render.work;
      while (!render.step(Infinity));
      render.result();
    }
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  // The first run includes JIT warm-up, which a listener's cold Start also
  // pays, so it is reported rather than thrown away.
  const first = times[0];
  const best = Math.min(...times.slice(1));
  const each = (best * 1e6) / work;
  console.log(
    `${mode.padEnd(8)} ${hz.length} strings: ${best.toFixed(0)} ms (first ${first.toFixed(0)} ms), ` +
      `${(work / 1e6).toFixed(1)}M harmonic-samples, ${each.toFixed(2)} ns each`,
  );
}
