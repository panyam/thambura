// Renders the PNG and ICO files that browsers, home screens and link-preview
// bots need, from the SVG and HTML sources. Run from the repo root:
//
//   node design/render-images.mjs
//
// It needs playwright-core and a Chromium it can launch. Neither is a project
// dependency, so point at an install with PLAYWRIGHT_CORE (a path to the
// package) and, if its bundled browser isn't installed, CHROMIUM (the binary).
//
// Writes:
//   web/static/og.png                  1200x630 link preview, from design/og.html
//   web/static/icons/apple-touch-icon.png, icon-192.png, icon-512.png,
//     icon-512-maskable.png            the logo on white, from web/static/favicon.svg
//   web/static/favicon.ico             16, 32 and 48 px, transparent

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");

const STATIC = "web/static";
const logo = `data:image/svg+xml;base64,${readFileSync(`${STATIC}/favicon.svg`).toString("base64")}`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

async function shoot(size, html, { transparent = false } = {}) {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
  if (html.startsWith("file:")) await page.goto(html, { waitUntil: "networkidle" });
  else await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ omitBackground: transparent });
  await page.close();
  return png;
}

// The logo centred on a square, filling `fill` of it.
const icon = (px, fill, background) =>
  `<body style="margin:0;width:${px}px;height:${px}px;display:grid;place-items:center;background:${background}">` +
  `<img src="${logo}" style="width:${Math.round(px * fill)}px;height:${Math.round(px * fill)}px"></body>`;

writeFileSync(`${STATIC}/og.png`, await shoot({ w: 1200, h: 630 }, pathToFileURL(resolve("design/og.html")).href));

mkdirSync(`${STATIC}/icons`, { recursive: true });
// Home-screen icons are opaque; the maskable one keeps the logo inside the
// centre 80% that every mask shape leaves visible.
for (const [name, px, fill] of [
  ["apple-touch-icon", 180, 0.72],
  ["icon-192", 192, 0.72],
  ["icon-512", 512, 0.72],
  ["icon-512-maskable", 512, 0.56],
]) {
  writeFileSync(`${STATIC}/icons/${name}.png`, await shoot({ w: px, h: px }, icon(px, fill, "#ffffff")));
}

const favicons = [];
for (const px of [16, 32, 48]) favicons.push([px, await shoot({ w: px, h: px }, icon(px, 1, "transparent"), { transparent: true })]);
writeFileSync(`${STATIC}/favicon.ico`, ico(favicons));

await browser.close();

/** An ICO file holding PNG images, one directory entry per size. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(([px, png], i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(px % 256, e); // width (0 means 256)
    header.writeUInt8(px % 256, e + 1); // height
    header.writeUInt8(0, e + 2); // palette size
    header.writeUInt8(0, e + 3); // reserved
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(([, png]) => png)]);
}
