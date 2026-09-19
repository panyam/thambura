import { onCleanup, onMount } from "solid-js";

// Seconds of history in the level view, and its columns per second.
const HISTORY_SECONDS = 8;
const COLUMNS_PER_SECOND = 60;
// The level view shows this many dB below the loudest moment on screen: a
// drone moves only a few dB, so a narrow range shows its plucks and swells.
const LEVEL_RANGE_DB = 12;
// Each level column is the RMS of this long, so the strings' beating doesn't read as noise.
const LEVEL_WINDOW_SECONDS = 0.05;
// The wave view shows this much of the waveform.
const WAVE_SECONDS = 0.04;
// The spectrum's range, and how far below its loudest harmonic it shows.
const LOW_HZ = 50;
const HIGH_HZ = 8000;
const SPECTRUM_RANGE_DB = 50;
// Where the jawari bloom lives (docs/sound-analysis.md).
const BLOOM_BAND = [1000, 2500];

/**
 * What the thambura is playing, every string that is on, mixed:
 *
 * - the level over the last 8 s, in dB, where plucks and the bloom's swell
 *   show as bumps and the round's rhythm as their spacing;
 * - the wave itself, 40 ms of it, steadied on a rising zero crossing;
 * - the spectrum from 50 Hz to 8 kHz, with the jawari's bloom band shaded.
 *
 * It reads an AnalyserNode on the drone bus, so it shows exactly what is
 * heard, and it freezes while stopped so the last moments can be studied.
 */
export function ThamburaScope(props: { analyser: () => AnalyserNode | null; playing: () => boolean }) {
  let levelCanvas!: HTMLCanvasElement;
  let waveCanvas!: HTMLCanvasElement;
  let spectrumCanvas!: HTMLCanvasElement;
  let root!: HTMLDivElement;

  onMount(() => {
    const columns = HISTORY_SECONDS * COLUMNS_PER_SECOND;
    const level = new Float32Array(columns).fill(-Infinity);
    let head = 0;
    let carry = 0;
    let last = performance.now();
    let time: Float32Array<ArrayBuffer> | null = null;
    let freq: Float32Array<ArrayBuffer> | null = null;
    let frame = 0;
    let ink = "";
    let grid = "";
    let styled = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const a = props.analyser();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      // Colours follow the theme; reading them twice a second is plenty.
      if (now - styled > 500) {
        const cs = getComputedStyle(root);
        ink = cs.color;
        grid = cs.getPropertyValue("--scope-grid").trim() || "rgba(128,128,128,.35)";
        styled = now;
      }
      for (const c of [levelCanvas, waveCanvas, spectrumCanvas]) fit(c);
      if (!a) return;
      const playing = props.playing();

      if (!time || time.length !== a.fftSize) time = new Float32Array(a.fftSize);
      if (!freq || freq.length !== a.frequencyBinCount) freq = new Float32Array(a.frequencyBinCount).fill(-Infinity);
      if (playing) {
        a.getFloatTimeDomainData(time);
        a.getFloatFrequencyData(freq);
        // New level columns for the time that passed, each from its share of the newest samples.
        carry += dt * COLUMNS_PER_SECOND;
        const count = Math.min(Math.floor(carry), 8);
        carry -= count;
        const per = Math.max(1, Math.round(a.context.sampleRate / COLUMNS_PER_SECOND));
        const span = Math.min(time.length, Math.round(a.context.sampleRate * LEVEL_WINDOW_SECONDS));
        for (let c = count - 1; c >= 0; c--) {
          const end = time.length - c * per;
          let sum = 0;
          for (let i = Math.max(0, end - span); i < end; i++) sum += time[i] * time[i];
          level[head] = 10 * Math.log10(sum / span + 1e-12);
          head = (head + 1) % columns;
        }
      }
      drawLevel(levelCanvas, level, head, ink, grid);
      drawWave(waveCanvas, time, a.context.sampleRate, ink, grid);
      drawSpectrum(spectrumCanvas, freq, a.context.sampleRate, ink, grid);
    };
    frame = requestAnimationFrame(draw);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  const pane = "h-20 w-full rounded-md bg-gray-50 dark:bg-gray-800/60";
  const caption = "text-xs text-gray-500 dark:text-gray-400";
  return (
    <div
      ref={root}
      class="grid gap-2 text-amber-600 [--scope-grid:theme(colors.gray.300)] sm:grid-cols-[2fr_1fr_2fr] dark:text-amber-400 dark:[--scope-grid:theme(colors.gray.700)]"
    >
      <figure class="grid gap-1">
        <canvas ref={levelCanvas} class={pane} aria-hidden="true" />
        <figcaption class={caption}>Level, last {HISTORY_SECONDS} s (lines every 3 dB)</figcaption>
      </figure>
      <figure class="grid gap-1">
        <canvas ref={waveCanvas} class={pane} aria-hidden="true" />
        <figcaption class={caption}>Wave, {WAVE_SECONDS * 1000} ms</figcaption>
      </figure>
      <figure class="grid gap-1">
        <canvas ref={spectrumCanvas} class={pane} aria-hidden="true" />
        <figcaption class={caption}>Spectrum, 50 Hz-8 kHz; shaded: the bloom band</figcaption>
      </figure>
    </div>
  );
}

/** Sizes the canvas's pixels to its box at the screen's density. */
function fit(c: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(c.clientWidth * dpr));
  const h = Math.max(1, Math.round(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
}

function drawLevel(c: HTMLCanvasElement, level: Float32Array, head: number, ink: string, grid: string): void {
  const g = c.getContext("2d");
  if (!g) return;
  const { width: w, height: h } = c;
  g.clearRect(0, 0, w, h);
  let top = -Infinity;
  for (const v of level) top = Math.max(top, v);
  if (!Number.isFinite(top)) return;
  const floor = top - LEVEL_RANGE_DB;
  g.fillStyle = grid;
  for (let db = 3; db < LEVEL_RANGE_DB; db += 3) g.fillRect(0, Math.floor((db / LEVEL_RANGE_DB) * h), w, 1);
  const n = level.length;
  const colW = w / n;
  const yOf = (v: number) => h - (Math.max(0, v - floor) / LEVEL_RANGE_DB) * (h - 2);
  // A firm line over a light fill down to the floor.
  g.beginPath();
  let first = -1;
  let lastX = 0;
  for (let i = 0; i < n; i++) {
    const v = level[(head + i) % n];
    if (!Number.isFinite(v)) continue;
    const x = i * colW;
    if (first < 0) {
      first = x;
      g.moveTo(x, yOf(v));
    } else g.lineTo(x, yOf(v));
    lastX = x;
  }
  if (first < 0) return;
  g.strokeStyle = ink;
  g.lineWidth = Math.max(1, (window.devicePixelRatio || 1) * 1.25);
  g.stroke();
  g.lineTo(lastX, h);
  g.lineTo(first, h);
  g.closePath();
  g.fillStyle = ink;
  g.globalAlpha = 0.2;
  g.fill();
  g.globalAlpha = 1;
}

function drawWave(c: HTMLCanvasElement, time: Float32Array, sampleRate: number, ink: string, grid: string): void {
  const g = c.getContext("2d");
  if (!g) return;
  const { width: w, height: h } = c;
  g.clearRect(0, 0, w, h);
  g.fillStyle = grid;
  g.fillRect(0, Math.floor(h / 2), w, 1);
  const span = Math.min(time.length, Math.round(WAVE_SECONDS * sampleRate));
  // Start at a rising zero crossing, so the picture holds still from frame to frame.
  let start = time.length - span;
  for (let i = time.length - span; i > time.length - span - Math.min(2048, time.length - span); i--) {
    if (i > 0 && time[i - 1] < 0 && time[i] >= 0) {
      start = i;
      break;
    }
  }
  let peak = 1e-4;
  for (let i = start; i < start + span; i++) peak = Math.max(peak, Math.abs(time[i]));
  g.beginPath();
  for (let px = 0; px < w; px++) {
    const v = time[start + Math.floor((px / w) * span)] / peak;
    const y = h / 2 - v * (h / 2 - 2);
    if (px === 0) g.moveTo(px, y);
    else g.lineTo(px, y);
  }
  g.strokeStyle = ink;
  g.lineWidth = Math.max(1, (window.devicePixelRatio || 1) * 1.25);
  g.stroke();
}

function drawSpectrum(c: HTMLCanvasElement, freq: Float32Array, sampleRate: number, ink: string, grid: string): void {
  const g = c.getContext("2d");
  if (!g) return;
  const { width: w, height: h } = c;
  g.clearRect(0, 0, w, h);
  const xOf = (hz: number) => (Math.log(hz / LOW_HZ) / Math.log(HIGH_HZ / LOW_HZ)) * w;
  g.fillStyle = grid;
  g.globalAlpha = 0.6;
  g.fillRect(xOf(BLOOM_BAND[0]), 0, xOf(BLOOM_BAND[1]) - xOf(BLOOM_BAND[0]), h);
  g.globalAlpha = 1;
  for (const hz of [100, 1000]) g.fillRect(Math.floor(xOf(hz)), 0, 1, h);

  const binHz = sampleRate / 2 / freq.length;
  const hzAt = (px: number) => LOW_HZ * (HIGH_HZ / LOW_HZ) ** (px / w);
  // Each pixel: the loudest bin under it, or, where bins are wider than pixels,
  // a value interpolated between the two nearest, so low harmonics stay smooth.
  const column = new Float32Array(w);
  let top = -Infinity;
  for (let px = 0; px < w; px++) {
    const lo = hzAt(px) / binHz;
    const hi = hzAt(px + 1) / binHz;
    let db: number;
    if (hi - lo < 1) {
      const b = Math.min(freq.length - 2, Math.floor(lo));
      db = freq[b] + (freq[b + 1] - freq[b]) * (lo - b);
    } else {
      db = -Infinity;
      for (let b = Math.floor(lo); b < Math.ceil(hi) && b < freq.length; b++) db = Math.max(db, freq[b]);
    }
    column[px] = db;
    if (Number.isFinite(db)) top = Math.max(top, db);
  }
  if (!Number.isFinite(top)) return;
  const floor = top - SPECTRUM_RANGE_DB;
  g.beginPath();
  for (let px = 0; px < w; px++) {
    const v = Number.isFinite(column[px]) ? column[px] : floor;
    const y = h - (Math.max(0, v - floor) / SPECTRUM_RANGE_DB) * (h - 2);
    if (px === 0) g.moveTo(px, y);
    else g.lineTo(px, y);
  }
  g.strokeStyle = ink;
  g.lineWidth = Math.max(1, (window.devicePixelRatio || 1) * 1.25);
  g.stroke();
}
