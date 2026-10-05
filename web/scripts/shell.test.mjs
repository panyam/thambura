import { describe, expect, it } from "vitest";
import { shellFor } from "./shell.mjs";

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
