import { describe, expect, it } from "vitest";
import { preloadFor, shellFor } from "./shell.mjs";

const metafile = {
  outputs: {
    "static/app.js": { entryPoint: "src/main.ts" },
    "static/app.js.map": {},
    "static/chunks/ThamburaLab-4F2A.js": {},
    "static/chunks/ThamburaLab-4F2A.js.map": {},
    "static/chunks/chunk-9QX1.js": {},
    "static/chunks/ThamburaRaagini-7ZZ0.js": {},
  },
};

describe("shellFor", () => {
  it("lists every script the build wrote, as URLs, after the fixed extras", () => {
    const shell = shellFor(metafile, { outdir: "static", base: "/static", extras: ["/", "/static/css/tailwind.css", "/static/app.js"] });
    expect(shell).toEqual([
      "/",
      "/static/css/tailwind.css",
      "/static/app.js",
      "/static/chunks/ThamburaLab-4F2A.js",
      "/static/chunks/ThamburaRaagini-7ZZ0.js",
      "/static/chunks/chunk-9QX1.js",
    ]);
  });

  it("leaves out source maps and anything outside the output folder", () => {
    const shell = shellFor({ outputs: { "static/x.js.map": {}, "elsewhere/y.js": {}, "static/z.css": {} } }, { outdir: "static", base: "/static", extras: [] });
    expect(shell).toEqual(["/static/z.css"]);
  });

  it("accepts an absolute or ./ output folder", () => {
    expect(shellFor({ outputs: { "./out/app.js": {} } }, { outdir: "./out", base: "/static", extras: [] })).toEqual(["/static/app.js"]);
  });
});

describe("preloadFor", () => {
  const meta = {
    outputs: {
      "static/app.js": {
        entryPoint: "src/main.ts",
        imports: [
          { path: "static/chunks/chunk-A.js", kind: "import-statement" },
          { path: "static/chunks/ThamburaLab-L.js", kind: "dynamic-import" },
        ],
      },
      "static/chunks/chunk-A.js": { imports: [{ path: "static/chunks/chunk-B.js", kind: "import-statement" }] },
      "static/chunks/chunk-B.js": { imports: [{ path: "static/chunks/chunk-A.js", kind: "import-statement" }] },
      "static/chunks/ThamburaLab-L.js": { imports: [{ path: "static/chunks/chunk-C.js", kind: "import-statement" }] },
      "static/chunks/chunk-C.js": { imports: [] },
    },
  };

  it("lists every chunk an entry loads before it runs, but not what it loads on demand", () => {
    expect(preloadFor(meta, "app", { outdir: "static", base: "/static" })).toEqual(["/static/chunks/chunk-A.js", "/static/chunks/chunk-B.js"]);
  });

  it("is empty for an entry that imports nothing, and for one the build didn't write", () => {
    const one = { outputs: { "static/app.js": { entryPoint: "src/main.ts", imports: [] } } };
    expect(preloadFor(one, "app", { outdir: "static", base: "/static" })).toEqual([]);
    expect(preloadFor(one, "embed", { outdir: "static", base: "/static" })).toEqual([]);
  });
});
