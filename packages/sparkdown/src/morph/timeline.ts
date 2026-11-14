import { parseMorphEasing, type MorphEasing } from "./easing";
import { hashText } from "./hash";
import type { MorphTiming } from "./types";

export type MorphPlayhead =
  | { phase: "off" }
  | { phase: "waiting"; play: 0; offset: number }
  | { phase: "playing" | "between"; play: number; offset: number }
  | { phase: "done"; play: number; offset: number };

export function morphRandom(seed: string): () => number {
  let state = Number.parseInt(hashText(seed).slice(0, 8), 16) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export class MorphTimeline {
  protected easing: MorphEasing;
  protected duration: number;
  protected delay: number;
  protected plays: number;
  protected gap?: { min: number; max: number };
  protected starts: number[] = [];
  protected spans: [number, number][] = [];
  protected beeps?: number[];
  protected ready = -Infinity;

  constructor(
    protected timing: MorphTiming,
    protected random: () => number,
  ) {
    this.easing = parseMorphEasing(timing.easing) ?? ((x) => x);
    this.duration = Number.isFinite(timing.duration) ? timing.duration : 0;
    this.delay = Number.isFinite(timing.delay) && timing.delay > 0 ? timing.delay : 0;
    const iterations = timing.iterations;
    this.plays =
      iterations === "infinite"
        ? Infinity
        : Number.isInteger(iterations) && iterations > 0
          ? iterations
          : 0;
    const { iteration_delay_min: min, iteration_delay_max: max } = timing;
    if (typeof min === "number" && typeof max === "number" && Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= min) {
      this.gap = { min, max };
    }
    if (timing.trigger !== "speech" && this.duration > 0 && this.plays > 0) this.starts.push(this.delay);
  }

  get start(): number {
    return this.directed(0, 0);
  }

  protected gapAfter(): number {
    if (!this.gap) return 0;
    return this.gap.min + (this.gap.max - this.gap.min) * this.random();
  }

  protected directed(play: number, p: number): number {
    switch (this.timing.direction) {
      case "reverse":
        return 1 - p;
      case "alternate":
        return play % 2 === 0 ? p : 1 - p;
      case "alternate-reverse":
        return play % 2 === 0 ? 1 - p : p;
      default:
        return p;
    }
  }

  protected offset(play: number, p: number): number {
    return clamp01(this.easing(this.directed(play, p)));
  }

  speak(spans: readonly (readonly [number, number])[], now: number, beeps?: readonly number[]) {
    if (this.timing.trigger !== "speech") return;
    this.at(now);
    this.spans = spans
      .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
      .map(([start, end]): [number, number] => [start, end])
      .sort((a, b) => a[0] - b[0]);
    this.beeps = this.timing.sync === "beep" && beeps ? beeps.filter(Number.isFinite).sort((a, b) => a - b) : undefined;
  }

  protected nextStart(from: number, last: number | undefined): number | undefined {
    if (this.beeps) return this.beeps.find((beep) => beep >= from - 1e-9 && (last === undefined || beep > last));
    const span = this.spans.find(([, end]) => end > from);
    return span && Math.max(from, span[0]);
  }

  protected spoken(t: number): MorphPlayhead {
    if (!(this.duration > 0)) return { phase: "off" };
    for (;;) {
      const last = this.starts[this.starts.length - 1];
      if (last !== undefined && last + this.duration > t) break;
      const next = this.nextStart(last === undefined ? -Infinity : this.ready, last);
      if (next === undefined || next > t || (last !== undefined && !(next > last))) break;
      this.starts.push(next);
      this.ready = next + this.duration + (this.beeps ? 0 : this.gapAfter());
    }
    const play = this.starts.length - 1;
    if (play < 0) return { phase: "off" };
    const elapsed = t - this.starts[play]!;
    if (elapsed < this.duration) return { phase: "playing", play, offset: this.offset(play, elapsed / this.duration) };
    if (this.spans.some(([start, end]) => start <= t && t < end)) return { phase: "between", play, offset: this.offset(play, 1) };
    return { phase: "off" };
  }

  at(t: number): MorphPlayhead {
    if (this.timing.trigger === "speech") return this.spoken(t);
    if (!this.starts.length) return { phase: "off" };
    if (t < this.delay) return { phase: "waiting", play: 0, offset: this.start };
    const starts = this.starts;
    while (starts.length < this.plays && starts[starts.length - 1]! + this.duration <= t) {
      const last = starts[starts.length - 1]!;
      const next = last + this.duration + this.gapAfter();
      if (!(next > last)) break;
      starts.push(next);
    }
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= t) lo = mid;
      else hi = mid - 1;
    }
    const play = lo;
    const elapsed = t - starts[play]!;
    if (elapsed < this.duration) return { phase: "playing", play, offset: this.offset(play, elapsed / this.duration) };
    const end = this.offset(play, 1);
    return play + 1 >= this.plays ? { phase: "done", play, offset: end } : { phase: "between", play, offset: end };
  }
}
