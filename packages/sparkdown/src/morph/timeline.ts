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

const MARK = 1024;

const mix = (h: number) => {
  h = (h + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};

const fold = (h: number, part: number) => mix(mix(h ^ (part >>> 0)) ^ Math.floor(part / 4294967296));

export function morphReplayStretch(easing: string, start: number, end: number): { from: number; to: number } | undefined {
  const from = firstMorphEasingReach(easing, start);
  const to = firstMorphEasingReach(easing, end);
  return to > from ? { from, to } : undefined;
}

interface Stretch {
  from: number;
  to: number;
  hold: number;
  range: number;
  replay: MorphReplay;
  rest: number;
  spread: number;
}

interface Segment {
  down: boolean;
  x: number;
  cycle: number[];
  reps: number;
  left: number[];
  ordinal: number;
  entry: number;
  inner: number[];
  wrap: number;
  round: number;
  paused: boolean;
  waits?: (number | undefined)[];
  marks: number[];
  total?: number;
}

interface Step {
  segment: number;
  r: number;
  q: number;
  turn: number;
}

interface Hit {
  segment: number;
  r: number;
  q: number;
  left: number;
  held: boolean;
}

interface Play {
  start: number;
  index: number;
  reversed: boolean;
  counts: number[];
  segments?: Segment[];
  tail: number;
  settled: number;
  gap: number;
  length?: number;
}

export class MorphTimeline {
  protected easing: MorphEasing;
  protected duration: number;
  protected delay: number;
  protected plays: number;
  protected gap?: { min: number; max: number };
  protected stretches: Stretch[] = [];
  protected key = 0;
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
    (timing.replay ?? []).forEach((replay, range) => {
      if (!(replay.chance > 0 && replay.count >= 1)) return;
      const found = morphReplayStretch(timing.easing, replay.from, replay.to);
      if (!found) return;
      const { delay_min: least, delay_max: most } = replay;
      const paused = least !== undefined && most !== undefined;
      this.stretches.push({ ...found, hold: replay.to, range, replay, rest: paused ? least : 0, spread: paused ? most - least : 0 });
    });
    if (this.stretches.some(({ replay, spread }) => replay.chance < 1 || spread !== 0)) this.key = Math.floor(random() * 4294967296);
    if (timing.trigger !== "speech" && this.duration > 0 && this.plays > 0) this.schedule(this.delay);
  }

  get start(): number {
    return this.directed(0, 0);
  }

  protected gapAfter(): number {
    if (!this.gap) return 0;
    return this.gap.min + (this.gap.max - this.gap.min) * this.random();
  }

  protected draw(kind: number, play: number, range: number, replay: number): number {
    return fold(fold(fold(fold(this.key, kind), play), range), replay) / 4294967296;
  }

  protected counted(play: number): number[] {
    return this.stretches.map(({ replay, range }) => {
      const most = Math.ceil(replay.count);
      if (replay.chance >= 1) return most;
      return Math.min(most, Math.floor(Math.log1p(-this.draw(0, play, range, 0)) / Math.log(replay.chance)));
    });
  }

  protected schedule(start: number): Play {
    const index = this.runs.length;
    const reversed = this.directed(index, 0) === 1;
    const play: Play = { start, index, reversed, counts: this.counted(index), tail: reversed ? 1 : 0, settled: 0, gap: 0 };
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

  protected turnPoint(down: boolean, c: number): number {
    const stretch = this.stretches[c]!;
    return down ? stretch.from : stretch.to;
  }

  protected resume(down: boolean, c: number): number {
    const stretch = this.stretches[c]!;
    return down ? stretch.to : stretch.from;
  }

  protected next(down: boolean, x: number, left: readonly number[]): number | undefined {
    let found: number | undefined;
    let nearest = 0;
    this.stretches.forEach((_, c) => {
      if (!(left[c]! > 0)) return;
      const point = this.turnPoint(down, c);
      if (!(down ? point < x : point > x)) return;
      if (found === undefined || (down ? point > nearest : point < nearest)) {
        found = c;
        nearest = point;
      }
    });
    return found;
  }

  protected segment(down: boolean, x: number, cycle: number[], reps: number, left: readonly number[], ordinal: number): Segment {
    const run = (from: number, to: number) => (down ? from - to : to - from) * this.duration;
    const last = cycle[cycle.length - 1]!;
    const inner = cycle.map((c, q) => (q === 0 ? 0 : run(this.resume(down, cycle[q - 1]!), this.turnPoint(down, c))));
    const wrap = run(this.resume(down, last), this.turnPoint(down, cycle[0]!));
    let round = wrap;
    cycle.forEach((c, q) => {
      if (q > 0) round += inner[q]!;
      round += this.stretches[c]!.rest;
    });
    return {
      down,
      x,
      cycle,
      reps,
      left: left.slice(),
      ordinal,
      entry: run(x, this.turnPoint(down, cycle[0]!)),
      inner,
      wrap,
      round,
      paused: cycle.some((c) => this.stretches[c]!.spread !== 0),
      marks: [0],
    };
  }

  protected walk(down: boolean, x: number, counts: readonly number[], ordinal: number): { segments: Segment[]; end: number } {
    const left = counts.slice();
    const segments: Segment[] = [];
    let seen: { x: number; c: number }[] = [];
    for (;;) {
      const c = this.next(down, x, left);
      if (c === undefined) break;
      const again = seen.findIndex((step) => step.x === x);
      const cycle = again < 0 ? [c] : seen.slice(again).map((step) => step.c);
      const reps = again < 0 ? 1 : Math.min(...cycle.map((member) => left[member]!));
      segments.push(this.segment(down, x, cycle, reps, left, ordinal));
      ordinal += reps * cycle.length;
      for (const member of cycle) left[member] = left[member]! - reps;
      if (again >= 0) {
        seen = [];
        continue;
      }
      seen.push({ x, c });
      x = this.resume(down, c);
      if (left[c] === 0) seen = [];
    }
    return { segments, end: x };
  }

  protected path(play: Play): Segment[] {
    if (play.segments) return play.segments;
    const forward = this.walk(false, 0, play.counts, 0);
    if (!play.reversed) {
      play.tail = forward.end;
      return (play.segments = forward.segments);
    }
    const left = play.counts.slice();
    let x = 1;
    let ordinal = 0;
    play.segments = forward.segments.reverse().map(({ cycle, reps }) => {
      const members = cycle.slice().reverse();
      const segment = this.segment(true, x, members, reps, left, ordinal);
      for (const c of members) left[c] = left[c]! - reps;
      ordinal += reps * members.length;
      x = this.resume(true, members[members.length - 1]!);
      return segment;
    });
    play.tail = x;
    return play.segments;
  }

  protected runOf(segment: Segment, r: number, q: number): number {
    return q > 0 ? segment.inner[q]! : r > 0 ? segment.wrap : segment.entry;
  }

  protected originOf(segment: Segment, r: number, q: number): number {
    if (q > 0) return this.resume(segment.down, segment.cycle[q - 1]!);
    return r > 0 ? this.resume(segment.down, segment.cycle[segment.cycle.length - 1]!) : segment.x;
  }

  protected pauseOf(play: Play, segment: Segment, r: number, q: number): number {
    const c = segment.cycle[q]!;
    const { rest, spread, range } = this.stretches[c]!;
    const replay = segment.down ? segment.left[c]! - 1 - r : play.counts[c]! - segment.left[c]! + r;
    const drawn = spread === 0 ? rest : rest + spread * this.draw(1, play.index, range, replay);
    const least = segment.waits?.[q];
    return least === undefined ? drawn : Math.max(drawn, least);
  }

  protected across(play: Play, segment: Segment, r: number, at: number): number {
    for (let q = 0; q < segment.cycle.length; q++) {
      at += this.runOf(segment, r, q);
      at += this.pauseOf(play, segment, r, q);
    }
    return at;
  }

  protected extend(play: Play, segment: Segment, i: number) {
    while (segment.marks.length <= i) {
      const j = segment.marks.length - 1;
      let rel = segment.marks[j]!;
      for (let r = 1 + j * MARK; r < 1 + (j + 1) * MARK; r++) rel = this.across(play, segment, r, rel);
      segment.marks.push(rel);
    }
  }

  protected mark(play: Play, segment: Segment, i: number): number {
    if (!segment.paused) return i * MARK * segment.round;
    this.extend(play, segment, i);
    return segment.marks[i]!;
  }

  protected markBelow(play: Play, segment: Segment, left: number): number {
    const last = Math.floor((segment.reps - 1) / MARK);
    if (!segment.paused) {
      let i = Math.min(last, Math.max(0, Math.floor(left / (MARK * segment.round))));
      while (i > 0 && this.mark(play, segment, i) > left) i -= 1;
      while (i < last && this.mark(play, segment, i + 1) <= left) i += 1;
      return i;
    }
    const { marks } = segment;
    let lo = 0;
    let hi = marks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (marks[mid]! <= left) lo = mid;
      else hi = mid - 1;
    }
    while (lo === marks.length - 1 && lo < last && this.mark(play, segment, lo + 1) <= left) lo += 1;
    return lo;
  }

  protected later(play: Play, segment: Segment, r: number): number {
    if (r === segment.reps && segment.total !== undefined) return segment.total;
    const i = Math.floor((r - 1) / MARK);
    let rel = this.mark(play, segment, i);
    for (let k = 1 + i * MARK; k < r; k++) rel = this.across(play, segment, k, rel);
    if (r === segment.reps) segment.total = rel;
    return rel;
  }

  protected inRound(play: Play, index: number, r: number, left: number): Hit | number {
    const segment = this.path(play)[index]!;
    for (let q = 0; q < segment.cycle.length; q++) {
      const run = this.runOf(segment, r, q);
      if (left < run) return { segment: index, r, q, left, held: false };
      left -= run;
      const pause = this.pauseOf(play, segment, r, q);
      if (left < pause) return { segment: index, r, q, left, held: true };
      left -= pause;
    }
    return left;
  }

  protected seek(play: Play, elapsed: number): Hit | { tail: number } {
    const segments = this.path(play);
    let left = elapsed;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const first = this.inRound(play, i, 0, left);
      if (typeof first !== "number") return first;
      left = first;
      if (segment.reps === 1) continue;
      const j = this.markBelow(play, segment, left);
      left -= this.mark(play, segment, j);
      for (let r = 1 + j * MARK; r < segment.reps; r++) {
        const found = this.inRound(play, i, r, left);
        if (typeof found !== "number") return found;
        left = found;
      }
    }
    return { tail: left };
  }

  protected step(play: Play, k: number): Step | undefined {
    const segments = this.path(play);
    let at = play.start;
    let held: number | undefined;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const m = segment.cycle.length;
      const local = k - segment.ordinal;
      const target = local < segment.reps * m ? Math.floor(local / m) : segment.reps;
      for (let r = 0; r < segment.reps; r++) {
        if (r === 1 && segment.reps > MARK && target > 1) {
          at = at + held! + this.later(play, segment, target);
          held = undefined;
          r = target;
          if (r === segment.reps) break;
        }
        for (let q = 0; q < m; q++) {
          const run = this.runOf(segment, r, q);
          at = held === undefined ? at + run : at + (held + run);
          if (r === target && q === local - target * m) return { segment: i, r, q, turn: at };
          held = this.pauseOf(play, segment, r, q);
        }
      }
    }
    return undefined;
  }

  protected steps(play: Play): number {
    const last = this.path(play).at(-1);
    return last ? last.ordinal + last.reps * last.cycle.length : 0;
  }

  protected before(play: Play, elapsed: number): number {
    const found = this.seek(play, elapsed);
    if ("tail" in found) return this.steps(play) - 1;
    const segment = this.path(play)[found.segment]!;
    return segment.ordinal + found.r * segment.cycle.length + found.q - 1;
  }

  protected length(play: Play, elapsed: number): number {
    if (play.length !== undefined) return play.length;
    if (!("tail" in this.seek(play, elapsed))) return Infinity;
    let total = this.duration;
    for (const segment of this.path(play)) {
      const stretches = segment.cycle.map((c) => (this.stretches[c]!.to - this.stretches[c]!.from) * this.duration);
      if (segment.reps > MARK) {
        const inner = segment.inner.reduce((sum, run) => sum + run, 0);
        const runs = segment.entry + inner + (segment.reps - 1) * (segment.wrap + inner);
        const time = this.across(play, segment, 0, 0) + this.later(play, segment, segment.reps);
        total += time - runs + segment.reps * stretches.reduce((sum, stretch) => sum + stretch, 0);
        continue;
      }
      for (let r = 0; r < segment.reps; r++) {
        segment.cycle.forEach((_, q) => {
          total = total + this.pauseOf(play, segment, r, q) + stretches[q]!;
        });
      }
    }
    play.length = total;
    return play.length;
  }

  protected playingAt(play: Play, elapsed: number): number {
    const found = this.seek(play, elapsed);
    if ("tail" in found) return this.position(play.reversed, play.tail, found.tail);
    const segment = this.path(play)[found.segment]!;
    if (found.held) return this.stretches[segment.cycle[found.q]!]!.hold;
    return this.position(segment.down, this.originOf(segment, found.r, found.q), found.left);
  }

  protected position(down: boolean, from: number, left: number): number {
    return clamp01(this.easing(down ? from - left / this.duration : from + left / this.duration));
  }

  protected part(segment: Segment, first: number, reps: number): Segment {
    const left = segment.left.slice();
    for (const c of segment.cycle) left[c] = left[c]! - first;
    const part = this.segment(segment.down, this.originOf(segment, first, 0), segment.cycle, reps, left, segment.ordinal + first * segment.cycle.length);
    if (first === 0 && segment.paused) part.marks = segment.marks.slice(0, Math.floor((reps - 1) / MARK) + 1);
    return part;
  }

  protected wait(play: Play, found: Step, least: number) {
    const segments = this.path(play);
    const segment = segments[found.segment]!;
    let held = segment;
    if (segment.reps > 1) {
      const parts: Segment[] = [];
      if (found.r > 0) parts.push(this.part(segment, 0, found.r));
      held = this.part(segment, found.r, 1);
      parts.push(held);
      if (found.r + 1 < segment.reps) parts.push(this.part(segment, found.r + 1, segment.reps - found.r - 1));
      segments.splice(found.segment, 1, ...parts);
    }
    (held.waits ??= [])[found.q] = least;
    play.length = undefined;
  }

  protected skip(play: Play, found: Step) {
    const segments = this.path(play);
    const segment = segments[found.segment]!;
    const { r, q } = found;
    const kept = segments.slice(0, found.segment);
    if (r > 0) kept.push(this.part(segment, 0, r));
    const left = segment.left.slice();
    for (const c of segment.cycle) left[c] = left[c]! - r;
    const ordinal = segment.ordinal + r * segment.cycle.length;
    if (q > 0) {
      const taken = segment.cycle.slice(0, q);
      const head = this.segment(segment.down, this.originOf(segment, r, 0), taken, 1, left, ordinal);
      if (segment.waits) head.waits = segment.waits.slice(0, q);
      kept.push(head);
      for (const c of taken) left[c] = left[c]! - 1;
    }
    const point = this.turnPoint(segment.down, segment.cycle[q]!);
    this.stretches.forEach((_, c) => {
      if (this.turnPoint(segment.down, c) === point) left[c] = 0;
    });
    const origin = this.originOf(segment, r, q);
    const rest = this.walk(segment.down, point, left, ordinal + q);
    const [first, ...later] = rest.segments;
    play.segments = first ? [...kept, this.segment(first.down, origin, first.cycle, first.reps, first.left, first.ordinal), ...later] : kept;
    play.tail = first ? rest.end : origin;
    play.length = undefined;
  }

  protected speaking(t: number): boolean {
    return this.spans.some(([start, end]) => start <= t && t < end);
  }

  protected settle(index: number, t: number) {
    const play = this.runs[index];
    if (!play || !this.stretches.length) return;
    for (;;) {
      const found = this.step(play, play.settled);
      if (!found) return;
      const at = found.turn;
      if (at > t) return;
      const span = this.spanFrom(at);
      if (!span) {
        this.skip(play, found);
        continue;
      }
      const least = Math.max(0, span[0] - at);
      if (least > this.pauseOf(play, this.path(play)[found.segment]!, found.r, found.q)) this.wait(play, found, least);
      play.settled = Math.max(play.settled + 1, this.before(play, Math.min(span[1], t) - play.start));
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
    const span = this.spanFrom(from);
    return span && Math.max(from, span[0]);
  }

  protected spanFrom(t: number): readonly [number, number] | undefined {
    return this.spans.find(([, end]) => end > t);
  }

  protected spoken(t: number): MorphPlayhead {
    if (!(this.duration > 0)) return { phase: "off" };
    for (;;) {
      const index = this.runs.length - 1;
      const last = this.runs[index];
      if (last) {
        this.settle(index, t);
        if (last.start + this.length(last, t - last.start) > t) break;
      }
      const ready = last ? last.start + this.length(last, t - last.start) + last.gap : -Infinity;
      const next = this.nextStart(ready, last?.start);
      if (next === undefined || next > t || (last !== undefined && !(next > last.start))) break;
      const play = this.schedule(next);
      play.gap = this.beeps ? 0 : this.gapAfter();
    }
    const index = this.runs.length - 1;
    const play = this.runs[index];
    if (!play) return { phase: "off" };
    const elapsed = t - play.start;
    if (elapsed < this.length(play, elapsed)) return { phase: "playing", play: index, offset: this.playingAt(play, elapsed) };
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
      if (!(runs.length < this.plays && last.start + this.length(last, t - last.start) <= t)) break;
      const next = last.start + this.length(last, t - last.start) + this.gapAfter();
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
    if (elapsed < this.length(play, elapsed)) return { phase: "playing", play: lo, offset: this.playingAt(play, elapsed) };
    const end = this.offset(lo, 1);
    return lo + 1 >= this.plays ? { phase: "done", play: lo, offset: end } : { phase: "between", play: lo, offset: end };
  }
}
