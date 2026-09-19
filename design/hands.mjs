// Generates the RightHand and LeftHand image groups: line-art hands, after the
// "Simple" set's poses. Run from the repo root:
//
//   node design/hands.mjs
//
// The hand is drawn once, as the back of a right hand with the thumb on the
// left, and mirrored for the left hand and for the palm (the wave). "one" is
// the little finger and "five" the thumb, as in Simple.

import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "web/static/Resources/Images";

const INK = "#2f2a26";
const DETAIL = "#6b625b";
const SKIN = "#f4f1ec";
const SHADE = "#b3aca4";

// Base centre on the webbing line, lean in degrees (+ leans right), length,
// width at the base and just below the tip. The sides run straight between
// the two, so a finger flares slightly into the web.
const FINGERS = {
  index: { x: 167, y: 188, lean: -5, len: 125, wb: 35, wt: 25 },
  middle: { x: 207, y: 187, lean: -1, len: 143, wb: 36, wt: 26 },
  ring: { x: 248, y: 188, lean: 3, len: 125, wb: 35, wt: 25 },
  little: { x: 287, y: 195, lean: 10, len: 97, wb: 30, wt: 21 },
};

// The thumb is part of the palm's outline. This frame only places its nail
// and crease: base centre at the crotch's level, leaning up and out.
const THUMB = { x: 124, y: 262, lean: -28, len: 96, wb: 36, wt: 30 };

// A point given in a finger's own frame (x across, y along, negative towards
// the tip), in image coordinates.
function at(f, x, y) {
  const r = (f.lean * Math.PI) / 180;
  return `${(f.x + x * Math.cos(r) - y * Math.sin(r)).toFixed(1)},${(f.y + x * Math.sin(r) + y * Math.cos(r)).toFixed(1)}`;
}

// Wrist (below the image's bottom edge; the image fades it out), up the
// thenar (the heel of the thumb) to the thumb's tip, down its inner edge to
// the crotch, up the side of the palm to the index knuckle, across the
// webbing (seen only between fingers) and down the little-finger side. The palm's sides leave the index and little fingers along their own
// edges, so the outline has no step there.
const { index: I, little: L } = FINGERS;
const PALM = [
  "M163,420",
  "C138,352 112,312 101,272",
  "C95,248 82,222 72,200",
  "A16.5,16.5 0 0 1 101,184.5",
  "C112,210 128,242 140,272",
  `C142,250 ${at(I, -I.wb / 2, 30)} ${at(I, -I.wb / 2, 0)}`,
  `C190,180 252,178 ${at(L, L.wb / 2, 0)}`,
  `C${at(L, L.wb / 2, 24)} 300,262 294,292`,
  "C288,320 278,352 262,420 Z",
].join(" ");

// A lit thumb is the palm's outline clipped to the thumb: past a line
// curving from the crotch to the thenar, and left of the palm's side.
const THUMB_CLIP = "M140,272 Q120,290 98,294 L20,310 L20,120 L145,120 L143,190 Z";

// The digit each count lights, as in Simple: the little finger first.
const COUNTS = { one: "little", two: "ring", three: "middle", four: "index", five: "thumb" };

const place = (f) => `translate(${f.x} ${f.y}) rotate(${f.lean})`;

function fingerPath(f) {
  const { len, wb, wt } = f;
  const top = -len + wt / 2;
  return [
    `M${-wb / 2},40`,
    `L${-wb / 2},0`,
    `L${-wt / 2},${top}`,
    `A${wt / 2},${wt / 2} 0 0 1 ${wt / 2},${top}`,
    `L${wb / 2},0`,
    `L${wb / 2},40 Z`,
  ].join(" ");
}

const fingerShape = (f, attrs) => `<path d="${fingerPath(f)}" transform="${place(f)}" ${attrs}/>`;

// Short curves across a digit at `at` (0 = base, 1 = tip), a pair on the
// back of the hand and one on the palm.
function crease(f, at, pair = true) {
  const y = -f.len * at;
  const w = (f.wb + (f.wt - f.wb) * at) * 0.3;
  const one = (dy) => `M${-w},${y + dy} Q0,${y + dy + 3} ${w},${y + dy}`;
  const d = pair ? `${one(-2.5)} ${one(2.5)}` : one(0);
  return `<path d="${d}" transform="${place(f)}"/>`;
}

function nail(f) {
  const w = f.wt * 0.62;
  const h = f.wt * 0.8;
  const top = -f.len + 5;
  return `<rect x="${-w / 2}" y="${top}" width="${w}" height="${h}" rx="${w * 0.38}" transform="${place(f)}"/>`;
}

const DIGITS = Object.values(FINGERS);

const BACK_DETAILS = () => [
  ...[...DIGITS, THUMB].map(nail),
  ...DIGITS.map((f) => crease(f, 0.42)),
  crease(THUMB, 0.4),
];

const PALM_DETAILS = () => [
  ...DIGITS.flatMap((f) => [crease(f, 0.3, false), crease(f, 0.62, false)]),
  crease(THUMB, 0.45, false),
  // Heart, head and life lines.
  `<path d="M298,226 C262,216 222,210 186,200"/>`,
  `<path d="M145,240 C190,244 240,260 284,284"/>`,
  `<path d="M144,238 C182,262 196,320 192,420"/>`,
];

/**
 * One image. `lit` is the digit shaded for a count, or null for the clap and
 * the wave. `palm` shows the palm side (the wave).
 */
function hand({ left, palm, lit }) {
  const mirror = left !== palm;
  const shapes = [`<path d="${PALM}"/>`, ...DIGITS.map((f) => fingerShape(f, ""))].join("");
  let shade = "";
  if (lit === "thumb") shade = `<path d="${PALM}" fill="${SHADE}" clip-path="url(#thumb)"/>`;
  // The palm goes on again over a lit finger, so its shading stops at the web.
  else if (lit) shade = `${fingerShape(FINGERS[lit], `fill="${SHADE}"`)}<path d="${PALM}" fill="${SKIN}"/>`;
  // The union outline: every shape stroked, then every shape filled over the
  // inner half of the strokes.
  const g = [
    `<g stroke="${INK}" stroke-width="6" stroke-linejoin="round" fill="${INK}">${shapes}</g>`,
    `<g fill="${SKIN}">${shapes}</g>`,
    shade,
    `<g fill="none" stroke="${DETAIL}" stroke-width="2.2" stroke-linecap="round">${(palm ? PALM_DETAILS() : BACK_DETAILS()).join("")}</g>`,
  ].join("\n    ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <clipPath id="thumb"><path d="${THUMB_CLIP}"/></clipPath>
    <linearGradient id="wrist" x1="0" y1="0" x2="0" y2="400" gradientUnits="userSpaceOnUse">
      <stop offset="0.8" stop-color="#fff"/>
      <stop offset="0.97" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
      <rect width="400" height="400" fill="url(#wrist)"/>
    </mask>
  </defs>
  <g mask="url(#fade)"><g${mirror ? ` transform="translate(400 0) scale(-1 1)"` : ""}>
    ${g}
  </g></g>
</svg>
`;
}

const POSES = {
  down: { palm: false, lit: null },
  open: { palm: true, lit: null },
  ...Object.fromEntries(Object.entries(COUNTS).map(([count, digit]) => [count, { palm: false, lit: digit }])),
};

for (const [group, left] of [["RightHand", false], ["LeftHand", true]]) {
  mkdirSync(`${OUT}/${group}`, { recursive: true });
  for (const [name, pose] of Object.entries(POSES)) {
    writeFileSync(`${OUT}/${group}/${name}.svg`, hand({ left, ...pose }));
  }
}
