/**
 * An exact fraction, for musical positions. Tick offsets like 1/7 of a 7/2
 * count beat, summed over a long session, would drift as floats; as ratios
 * two voices that reach the same point by different sums agree exactly.
 * Always in lowest terms with a positive denominator.
 */
export interface Ratio {
  readonly n: number;
  readonly d: number;
}

export function ratio(n: number, d = 1): Ratio {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) {
    throw new Error(`ratio: ${n}/${d} is not a fraction of integers`);
  }
  const g = gcd(Math.abs(n), Math.abs(d)) || 1;
  const sign = d < 0 ? -1 : 1;
  return { n: (sign * n) / g, d: (sign * d) / g };
}

export const ZERO = ratio(0);
export const ONE = ratio(1);

export function add(a: Ratio, b: Ratio): Ratio {
  return ratio(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function mul(a: Ratio, b: Ratio): Ratio {
  return ratio(a.n * b.n, a.d * b.d);
}

/** Negative, zero or positive as a is less than, equal to or greater than b. */
export function cmp(a: Ratio, b: Ratio): number {
  return a.n * b.d - b.n * a.d;
}

export function toNumber(a: Ratio): number {
  return a.n / a.d;
}

/**
 * The closest fraction to `x` with a denominator up to `maxDen`, by continued
 * fractions. For numbers typed as decimals ("0.5", 1.5) in the fixtures.
 */
export function fromNumber(x: number, maxDen = 10_000): Ratio {
  const sign = x < 0 ? -1 : 1;
  let v = Math.abs(x);
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  for (let i = 0; i < 32; i++) {
    const a = Math.floor(v);
    const [h2, k2] = [a * h1 + h0, a * k1 + k0];
    if (k2 > maxDen) break;
    [h0, h1, k0, k1] = [h1, h2, k1, k2];
    const frac = v - a;
    if (frac < 1e-12) break;
    v = 1 / frac;
  }
  return ratio(sign * h1, k1);
}

/**
 * Parses a number, a decimal string or a "p/q" string, falling back when
 * unparseable or when the denominator is zero.
 */
export function parseRatio(value: number | string | undefined, fallback: Ratio): Ratio {
  if (value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? fromNumber(value) : fallback;
  const slash = value.indexOf("/");
  if (slash < 0) {
    const x = parseFloat(value);
    return Number.isNaN(x) ? fallback : fromNumber(x);
  }
  const num = parseFloat(value.slice(0, slash));
  const den = parseFloat(value.slice(slash + 1));
  if (Number.isNaN(num) || Number.isNaN(den) || den === 0) return fallback;
  return Number.isInteger(num) && Number.isInteger(den) ? ratio(num, den) : fromNumber(num / den);
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}
