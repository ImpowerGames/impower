import { parseMorphEasing, type MorphEasing } from "./easing";
import { hashText } from "./hash";
import type { MorphReplay, MorphTiming } from "./types";

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

const GRID = 1024;

function firstReaching(easing: MorphEasing, position: number): number {
  if (position <= 0) return 0;
  if (position >= 1) return 1;
  const reaches = (x: number) => clamp01(easing(x)) >= position;
  let i = 0;
  while (i <= GRID && !reaches(i / GRID)) i++;
  if (i === 0) return 0;
  if (i > GRID) return 1;
  let lo = (i - 1) / GRID;
  let hi = i / GRID;
  for (;;) {
    const mid = (lo + hi) / 2;
    if (mid <= lo || mid >= hi) return hi;
    if (reaches(mid)) hi = mid;
    else lo = mid;
  }
}

export function morphReplayStretch(easing: MorphEasing, start: number, end: number): { from: number; to: number } | undefined {
  const from = firstReaching(easing, start);
  const to = firstReaching(easing, end);
  return to > from ? { from, to } : undefined;
}

interface Play {
  start: number;
  pauses: number[];
  settled: number;
  gap: number;
}

interface Stretch {
  from: number;
  to: number;
  hold: number;
  replay: MorphReplay;
}

export class MorphTimeline {
  protected easing: MorphEasing;
  protected duration: number;
  protected delay: number;
  protected plays: number;
  protected gap?: { min: number; max: number };
  protected stretch?: Stretch;
  protected runs: Play[] = [];
  protected spans: [number, number][] = [];
  protected beeps?: number[];

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
    const replay = timing.replay?.[0];
    if (replay && replay.chance > 0 && replay.count >= 1) {
      const found = morphReplayStretch(this.easing, replay.start, replay.end);
      if (found) this.stretch = { ...found, hold: replay.end, replay };
    }
    if (timing.trigger !== "speech" && this.duration > 0 && this.plays > 0) this.schedule(this.delay);
  }

  get start(): number {
    return this.directed(0, 0);
  }

  protected gapAfter(): number {
    if (!this.gap) return 0;
    return this.gap.min + (this.gap.max - this.gap.min) * this.random();
  }

  protected drawPauses(): number[] {
    const pauses: number[] = [];
    const replay = this.stretch?.replay;
    if (!replay) return pauses;
    const { chance, count, delay_min: min, delay_max: max } = replay;
    while (pauses.length < count) {
      if (chance < 1 && !(this.random() < chance)) break;
      pauses.push(min !== undefined && max !== undefined ? min + (max - min) * this.random() : 0);
    }
    return pauses;
  }

  protected schedule(start: number): Play {
    const play: Play = { start, pauses: this.drawPauses(), settled: 0, gap: 0 };
    this.runs.push(play);
    return play;
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

  protected length(play: Play): number {
    const stretch = this.stretch;
    if (!stretch || play.pauses.length === 0) return this.duration;
    const rerun = (stretch.to - stretch.from) * this.duration;
    return play.pauses.reduce((total, pause) => total + pause + rerun, this.duration);
  }

  protected turn(index: number, play: Play, i: number): number {
    const stretch = this.stretch!;
    const reversed = this.directed(index, 0) === 1;
    const rerun = (stretch.to - stretch.from) * this.duration;
    let at = play.start + (reversed ? 1 - stretch.from : stretch.to) * this.duration;
    for (let j = 0; j < i; j++) at += play.pauses[j]! + rerun;
    return at;
  }

  protected playingAt(index: number, play: Play, elapsed: number): number {
    const stretch = this.stretch;
    if (!stretch || play.pauses.length === 0) return this.offset(index, elapsed / this.duration);
    const reversed = this.directed(index, 0) === 1;
    const eased = (x: number) => clamp01(this.easing(x));
    const first = (reversed ? 1 - stretch.from : stretch.to) * this.duration;
    if (elapsed < first) return eased(reversed ? 1 - elapsed / this.duration : elapsed / this.duration);
    let left = elapsed - first;
    const rerun = (stretch.to - stretch.from) * this.duration;
    for (let i = 0; i < play.pauses.length; i++) {
      const pause = play.pauses[i]!;
      if (left < pause) return stretch.hold;
      left -= pause;
      if (left < rerun || i === play.pauses.length - 1) {
        return eased(reversed ? stretch.to - left / this.duration : stretch.from + left / this.duration);
      }
      left -= rerun;
    }
    return eased(reversed ? 0 : 1);
  }

  protected speaking(t: number): boolean {
    return this.spans.some(([start, end]) => start <= t && t < end);
  }

  protected settle(index: number, t: number) {
    const play = this.runs[index];
    if (!play || !this.stretch) return;
    while (play.settled < play.pauses.length) {
      const at = this.turn(index, play, play.settled);
      if (at > t) return;
      if (this.speaking(at)) play.settled += 1;
      else play.pauses.length = play.settled;
    }
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
      const index = this.runs.length - 1;
      const last = this.runs[index];
      if (last) {
        this.settle(index, t);
        if (last.start + this.length(last) > t) break;
      }
      const ready = last ? last.start + this.length(last) + last.gap : -Infinity;
      const next = this.nextStart(ready, last?.start);
      if (next === undefined || next > t || (last !== undefined && !(next > last.start))) break;
      const play = this.schedule(next);
      play.gap = this.beeps ? 0 : this.gapAfter();
    }
    const index = this.runs.length - 1;
    const play = this.runs[index];
    if (!play) return { phase: "off" };
    const elapsed = t - play.start;
    if (elapsed < this.length(play)) return { phase: "playing", play: index, offset: this.playingAt(index, play, elapsed) };
    if (this.speaking(t)) return { phase: "between", play: index, offset: this.offset(index, 1) };
    return { phase: "off" };
  }

  at(t: number): MorphPlayhead {
    if (this.timing.trigger === "speech") return this.spoken(t);
    if (!this.runs.length) return { phase: "off" };
    if (t < this.delay) return { phase: "waiting", play: 0, offset: this.start };
    const runs = this.runs;
    for (;;) {
      const last = runs[runs.length - 1]!;
      if (!(runs.length < this.plays && last.start + this.length(last) <= t)) break;
      const next = last.start + this.length(last) + this.gapAfter();
      if (!(next > last.start)) break;
      this.schedule(next);
    }
    let lo = 0;
    let hi = runs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (runs[mid]!.start <= t) lo = mid;
      else hi = mid - 1;
    }
    const play = runs[lo]!;
    const elapsed = t - play.start;
    if (elapsed < this.length(play)) return { phase: "playing", play: lo, offset: this.playingAt(lo, play, elapsed) };
    const end = this.offset(lo, 1);
    return lo + 1 >= this.plays ? { phase: "done", play: lo, offset: end } : { phase: "between", play: lo, offset: end };
  }
}
