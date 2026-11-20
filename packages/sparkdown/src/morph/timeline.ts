import { firstMorphEasingReach, parseMorphEasing, type MorphEasing } from "./easing";
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

export function morphReplayStretch(easing: string, start: number, end: number): { from: number; to: number } | undefined {
  const from = firstMorphEasingReach(easing, start);
  const to = firstMorphEasingReach(easing, end);
  return to > from ? { from, to } : undefined;
}

interface Stretch {
  from: number;
  to: number;
  hold: number;
  replay: MorphReplay;
}

interface Run {
  from: number;
  to: number;
  length: number;
}

interface Hold {
  pause: number;
  hold: number;
}

interface Turn {
  steps: number[];
  resume: number;
  range: number;
  run: number;
}

interface Path {
  runs: Run[];
  holds: Hold[];
  turns: Turn[];
  taken: { pause: number; stretch: number }[];
}

interface Play {
  start: number;
  pauses: number[][];
  taken: boolean[];
  reversed: boolean;
  path?: Path;
  gap: number;
}

export class MorphTimeline {
  protected easing: MorphEasing;
  protected duration: number;
  protected delay: number;
  protected plays: number;
  protected gap?: { min: number; max: number };
  protected stretches: Stretch[] = [];
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
    for (const replay of timing.replay ?? []) {
      if (!(replay.chance > 0 && replay.count >= 1)) continue;
      const found = morphReplayStretch(timing.easing, replay.from, replay.to);
      if (found) this.stretches.push({ ...found, hold: replay.to, replay });
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

  protected drawPauses(): number[][] {
    return this.stretches.map(({ replay }) => {
      const pauses: number[] = [];
      const { chance, count, delay_min: min, delay_max: max } = replay;
      while (pauses.length < count) {
        if (chance < 1 && !(this.random() < chance)) break;
        pauses.push(min !== undefined && max !== undefined ? min + (max - min) * this.random() : 0);
      }
      return pauses;
    });
  }

  protected schedule(start: number): Play {
    const play: Play = { start, pauses: this.drawPauses(), taken: [], reversed: this.directed(this.runs.length, 0) === 1, gap: 0 };
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

  protected walk(
    path: Path,
    x: number,
    down: boolean,
    left: number[][],
    take: (pauses: number[]) => number | undefined,
    taken: (turn: number) => boolean,
  ): Path {
    const close = (to: number) => {
      const run = path.runs[path.runs.length - 1]!;
      run.to = to;
      run.length = (down ? run.from - to : to - run.from) * this.duration;
    };
    const ahead = (point: number, first: boolean) => (down ? point < x || (first && point === x) : point > x);
    for (let first = down; ; first = false) {
      let next: number | undefined;
      this.stretches.forEach((stretch, i) => {
        const point = down ? stretch.from : stretch.to;
        if (left[i]!.length && ahead(point, first) && (next === undefined || (down ? point > next : point < next))) next = point;
      });
      if (next === undefined) break;
      close(next);
      x = next;
      for (let i = 0; i < this.stretches.length; ) {
        const stretch = this.stretches[i]!;
        if ((down ? stretch.from : stretch.to) !== next || !left[i]!.length) {
          i += 1;
          continue;
        }
        const pause = take(left[i]!)!;
        const index = path.runs.length - 1;
        const run = path.runs[index]!;
        const partial = (down ? run.from - next : next - run.from) * this.duration;
        path.turns.push({ steps: this.timeAt(path, index, partial), resume: down ? stretch.to : stretch.from, range: i, run: index });
        if (!taken(path.turns.length - 1)) continue;
        path.holds.push({ pause, hold: stretch.hold });
        path.taken.push({ pause, stretch: (stretch.to - stretch.from) * this.duration });
        x = down ? stretch.to : stretch.from;
        path.runs.push({ from: x, to: x, length: 0 });
        break;
      }
    }
    close(down ? 0 : 1);
    return path;
  }

  protected timeAt(path: Path, run: number, partial: number): number[] {
    if (run === 0) return [partial];
    const previous = path.runs[run - 1]!;
    return [...this.timeAt(path, run - 1, previous.length), path.holds[run - 1]!.pause + partial];
  }

  protected forward(pauses: number[][], taken: (turn: number) => boolean): Path {
    const path: Path = { runs: [{ from: 0, to: 0, length: 0 }], holds: [], turns: [], taken: [] };
    return this.walk(path, 0, false, pauses.map((list) => list.slice()), (list) => list.shift(), taken);
  }

  protected backward(pauses: number[][], taken: (turn: number) => boolean): Path {
    const ahead = this.forward(pauses, () => true);
    const runs = ahead.runs.map(({ from, to, length }): Run => ({ from: to, to: from, length })).reverse();
    const holds = ahead.holds.slice().reverse();
    const ranges = ahead.turns.map(({ range }) => range).reverse();
    const path: Path = { runs: [runs[0]!], holds: [], turns: [], taken: [] };
    for (let k = 0; k < ranges.length; k++) {
      const range = ranges[k]!;
      const stretch = this.stretches[range]!;
      const run = path.runs[k]!;
      path.turns.push({ steps: this.timeAt(path, k, run.length), resume: run.to, range, run: k });
      if (!taken(k)) {
        const left = pauses.map((list) => list.slice());
        for (const { range: spent } of path.turns) left[spent]!.pop();
        return this.walk(path, run.to, true, left, (list) => list.pop(), taken);
      }
      path.holds.push(holds[k]!);
      path.taken.push({ pause: holds[k]!.pause, stretch: (stretch.to - stretch.from) * this.duration });
      path.runs.push({ ...runs[k + 1]! });
    }
    return path;
  }

  protected path(play: Play): Path {
    const taken = (turn: number) => play.taken[turn] ?? true;
    return (play.path ??= play.reversed ? this.backward(play.pauses, taken) : this.forward(play.pauses, taken));
  }

  protected length(play: Play): number {
    return this.path(play).taken.reduce((total, { pause, stretch }) => total + pause + stretch, this.duration);
  }

  protected playingAt(play: Play, elapsed: number): number {
    const { runs, holds } = this.path(play);
    let left = elapsed;
    for (let k = 0; k < runs.length; k++) {
      const run = runs[k]!;
      if (left < run.length || k === runs.length - 1) {
        return clamp01(this.easing(play.reversed ? run.from - left / this.duration : run.from + left / this.duration));
      }
      left -= run.length;
      const hold = holds[k]!;
      if (left < hold.pause) return hold.hold;
      left -= hold.pause;
    }
    return clamp01(this.easing(play.reversed ? 0 : 1));
  }

  protected speaking(t: number): boolean {
    return this.spans.some(([start, end]) => start <= t && t < end);
  }

  protected settle(index: number, t: number) {
    const play = this.runs[index];
    if (!play || !this.stretches.length) return;
    for (;;) {
      const turn = this.path(play).turns[play.taken.length];
      const at = turn?.steps.reduce((sum, step) => sum + step, play.start);
      if (at === undefined || at > t) return;
      play.taken.push(this.speaking(at));
      play.path = undefined;
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
    if (elapsed < this.length(play)) return { phase: "playing", play: index, offset: this.playingAt(play, elapsed) };
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
    if (elapsed < this.length(play)) return { phase: "playing", play: lo, offset: this.playingAt(play, elapsed) };
    const end = this.offset(lo, 1);
    return lo + 1 >= this.plays ? { phase: "done", play: lo, offset: end } : { phase: "between", play: lo, offset: end };
  }
}
