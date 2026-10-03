// Which talas play a written mridangam pattern, and which the generated
// skeleton: the exercise for the written-patterns mission (#185). Exits 1
// while any tala in scope is generated.
//
//   pnpm patterns:report    (make patternreport)
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Bundle the TypeScript for node in memory, then import it.
const bundle = await build({
  stdin: {
    contents: `export { formatReport, patternReport } from "./src/tools/patternReport";`,
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

const rows = lib.patternReport();
console.log(lib.formatReport(rows));
if (rows.some((r) => !r.main)) process.exitCode = 1;
