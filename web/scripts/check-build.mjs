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
//   each entry (app.js, embed.js) imports before it runs, found here by
//   reading the built files.
// - embed.js, which runs on other sites, carries none of our page chrome
//   (the service worker, the install button), and shares its chunks with
//   app.js rather than a second copy of Solid and the player.
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

  // What an entry imports statically, following chunks into chunks.
  const eagerOf = (entry) => {
    const found = new Set();
    const follow = (file, from) => {
      for (const m of readFileSync(file, "utf8").matchAll(/(?:from|import)\s*"(\.\/[^"]+\.js)"/g)) {
        const rel = join(from, m[1]);
        const url = "/static/" + rel.slice(out.length + 1);
        if (found.has(url)) continue;
        found.add(url);
        follow(rel, join(rel, ".."));
      }
    };
    follow(join(out, `${entry}.js`), out);
    return found;
  };
  let bundle = {};
  try {
    bundle = JSON.parse(readFileSync(manifest, "utf8"));
  } catch (e) {
    fail(`no readable bundle manifest: ${e.message}`);
  }
  const eager = {};
  for (const entry of ["app", "embed"]) {
    if (!existsSync(join(out, `${entry}.js`))) {
      fail(`the build wrote no ${entry}.js`);
      continue;
    }
    eager[entry] = eagerOf(entry);
    if (eager[entry].size === 0) fail(`${entry}.js imports no chunks, so there's nothing to preload; did splitting change?`);
    const listed = [...(bundle[entry]?.preload ?? [])].sort();
    const want = [...eager[entry]].sort();
    if (JSON.stringify(listed) !== JSON.stringify(want)) fail(`bundle.json preloads ${JSON.stringify(listed)} for ${entry}, but ${entry}.js imports ${JSON.stringify(want)}`);
  }
  if (eager.embed) {
    const embedCode = [join(out, "embed.js"), ...[...eager.embed].map((u) => join(out, u.slice("/static/".length)))].map((f) => readFileSync(f, "utf8")).join("\n");
    for (const [what, marker] of [
      ["the service worker registration", '"/sw.js"'],
      ["the install button", "install-app"],
    ]) {
      if (embedCode.includes(marker)) fail(`embed.js loads ${what}, which belongs to our pages, not a host's`);
    }
    if (eager.app && ![...eager.embed].some((c) => eager.app.has(c))) fail("embed.js shares no chunk with app.js; it carries its own copy of everything");
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures.length) {
  console.error("build check failed:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("build check passed");
