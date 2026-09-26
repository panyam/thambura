// Checks the frontend build (build.mjs) the way a deploy depends on it.
// Runs in `make test` (pnpm buildcheck) rather than vitest, since it needs
// node's fs and child_process and the web tsconfig has no node types.
//
// - The Lab and Raagini views are lazy: their code is in chunks, not app.js.
// - The service worker precaches every script the build wrote, so a visitor
//   who has been here once can open any view offline.
// - Chunks left from an earlier build are removed, so a deploy never uploads
//   a chunk nothing asks for.
// - The bundle manifest Go reads (bundle.json) preloads exactly the chunks
//   app.js imports before it runs, found here by reading the built files.
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const out = mkdtempSync(join(tmpdir(), "thambura-build-"));
const failures = [];
const fail = (msg) => failures.push(msg);
try {
  mkdirSync(join(out, "chunks"), { recursive: true });
  writeFileSync(join(out, "chunks", "stale-OLD.js"), "// from an earlier build\n");
  const manifest = join(out, "bundle.json");
  execFileSync("node", ["build.mjs", "--outdir", out, "--manifest", manifest], { stdio: "pipe" });

  if (existsSync(join(out, "chunks", "stale-OLD.js"))) fail("a chunk from an earlier build survived the build");
  const chunks = existsSync(join(out, "chunks")) ? readdirSync(join(out, "chunks")).filter((f) => f.endsWith(".js")) : [];
  if (chunks.length === 0) fail("the build wrote no chunks");

  const app = readFileSync(join(out, "app.js"), "utf8");
  const sw = readFileSync(join(out, "sw.js"), "utf8");
  // Text only each view draws. Solid compiles static attributes into HTML
  // templates, so match the text, not a quoted attribute.
  for (const [view, marker] of [
    ["ThamburaLab", "Settings JSON"],
    ["ThamburaRaagini", "SHRUTHI"],
  ]) {
    if (app.includes(marker)) fail(`${view} is in app.js; it should load on first use`);
    if (!chunks.some((c) => readFileSync(join(out, "chunks", c), "utf8").includes(marker))) fail(`no chunk holds ${view}`);
  }
  for (const url of ["/static/app.js", ...chunks.map((c) => `/static/chunks/${c}`)]) {
    if (!sw.includes(`"${url}"`)) fail(`the service worker doesn't precache ${url}`);
  }

  // What app.js imports statically, following chunks into chunks.
  const eager = new Set();
  const follow = (file, from) => {
    for (const m of readFileSync(file, "utf8").matchAll(/(?:from|import)\s*"(\.\/[^"]+\.js)"/g)) {
      const rel = join(from, m[1]);
      const url = "/static/" + rel.slice(out.length + 1);
      if (eager.has(url)) continue;
      eager.add(url);
      follow(rel, join(rel, ".."));
    }
  };
  follow(join(out, "app.js"), out);
  if (eager.size === 0) fail("app.js imports no chunks, so there's nothing to preload; did splitting change?");
  let bundle = {};
  try {
    bundle = JSON.parse(readFileSync(manifest, "utf8"));
  } catch (e) {
    fail(`no readable bundle manifest: ${e.message}`);
  }
  const listed = [...(bundle.app?.preload ?? [])].sort();
  const want = [...eager].sort();
  if (JSON.stringify(listed) !== JSON.stringify(want)) fail(`bundle.json preloads ${JSON.stringify(listed)}, but app.js imports ${JSON.stringify(want)}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures.length) {
  console.error("build check failed:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("build check passed");
