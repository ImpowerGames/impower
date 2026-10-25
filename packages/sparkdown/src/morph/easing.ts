// CSS timing functions as numbers: the one evaluator a morph's playback maps
// a play's progress through. It follows CSS Easing Functions Level 1
// (https://www.w3.org/TR/css-easing-1/) for the names and the
// `cubic-bezier()`, `steps()` and `linear()` functions `easingProblem`
// accepts. Inputs are the directed progress of one play, from 0 to 1; a
// morph never animates outside a play, so the before flag CSS uses at
// negative inputs never applies.

import { own } from "./own";

export type MorphEasing = (x: number) => number;

const linear: MorphEasing = (x) => x;

/** A CSS cubic Bézier through (0, 0) and (1, 1), solved for x. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): MorphEasing {
  if (x1 === y1 && x2 === y2) return linear;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-7) return t;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 64 && hi - lo > 1e-9; i++) {
      if (sampleX(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solve(x)));
}

type StepPosition = "jump-start" | "jump-end" | "jump-none" | "jump-both";

function steps(count: number, position: StepPosition): MorphEasing {
  const jumps = position === "jump-none" ? count - 1 : position === "jump-both" ? count + 1 : count;
  const leading = position === "jump-start" || position === "jump-both";
  return (x) => {
    let step = Math.floor(x * count) + (leading ? 1 : 0);
    if (step < 0) step = 0;
    if (step > jumps) step = jumps;
    return step / jumps;
  };
}

/** `linear(…)` stops, with every input placed as CSS places omitted ones. */
function linearStops(args: string[]): MorphEasing | undefined {
  const points: { output: number; input?: number }[] = [];
  for (const arg of args) {
    const [output, ...inputs] = arg.trim().split(/\s+/);
    const value = Number(output);
    if (!Number.isFinite(value)) return undefined;
    if (inputs.length === 0) points.push({ output: value });
    for (const input of inputs) points.push({ output: value, input: Number.parseFloat(input) / 100 });
  }
  if (points.length < 2) return undefined;
  if (points[0]!.input === undefined) points[0]!.input = 0;
  if (points[points.length - 1]!.input === undefined) points[points.length - 1]!.input = 1;
  // An input below an earlier one is raised to it.
  let largest = -Infinity;
  for (const point of points) {
    if (point.input === undefined) continue;
    point.input = Math.max(point.input, largest);
    largest = point.input;
  }
  // Runs of omitted inputs are spread evenly between their neighbours.
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.input !== undefined) continue;
    let j = i;
    while (points[j]!.input === undefined) j++;
    const start = points[i - 1]!.input!;
    const end = points[j]!.input!;
    for (let k = i; k < j; k++) points[k]!.input = start + ((end - start) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  const placed = points as { output: number; input: number }[];
  return (x) => {
    // The last stop at or before x starts the piece; equal inputs make a jump.
    let i = placed.length - 2;
    while (i > 0 && placed[i]!.input > x) i--;
    const a = placed[i]!;
    const b = placed[i + 1]!;
    if (b.input === a.input) return x < b.input ? a.output : b.output;
    return a.output + ((b.output - a.output) * (x - a.input)) / (b.input - a.input);
  };
}

const NAMED: Record<string, MorphEasing> = {
  linear,
  ease: cubicBezier(0.25, 0.1, 0.25, 1),
  "ease-in": cubicBezier(0.42, 0, 1, 1),
  "ease-out": cubicBezier(0, 0, 0.58, 1),
  "ease-in-out": cubicBezier(0.42, 0, 0.58, 1),
  "step-start": steps(1, "jump-start"),
  "step-end": steps(1, "jump-end"),
};

const cache = new Map<string, MorphEasing | undefined>();

/**
 * The timing function `text` names, or undefined when it is not one
 * (compilation reports that; a player then plays linearly).
 */
export function parseMorphEasing(text: string): MorphEasing | undefined {
  const key = text.trim();
  if (cache.has(key)) return cache.get(key);
  const parsed = parse(key);
  if (cache.size >= 64) cache.clear();
  cache.set(key, parsed);
  return parsed;
}

function parse(text: string): MorphEasing | undefined {
  const named = own(NAMED, text);
  if (named) return named;
  const call = /^([a-z-]+)\((.*)\)$/i.exec(text);
  if (!call) return undefined;
  const fn = call[1]!.toLowerCase();
  const args = call[2]!.split(",").map((a) => a.trim());
  if (fn === "cubic-bezier") {
    const n = args.map(Number);
    if (n.length !== 4 || !n.every(Number.isFinite) || n[0]! < 0 || n[0]! > 1 || n[2]! < 0 || n[2]! > 1) return undefined;
    return cubicBezier(n[0]!, n[1]!, n[2]!, n[3]!);
  }
  if (fn === "steps") {
    const count = Number(args[0]);
    if (!Number.isInteger(count) || count < 1 || args.length > 2) return undefined;
    const written = args[1] ?? "end";
    const position: StepPosition | undefined =
      written === "start" ? "jump-start" : written === "end" ? "jump-end" : (["jump-start", "jump-end", "jump-none", "jump-both"] as const).find((p) => p === written);
    if (!position || (position === "jump-none" && count < 2)) return undefined;
    return steps(count, position);
  }
  if (fn === "linear") return linearStops(args);
  return undefined;
}
