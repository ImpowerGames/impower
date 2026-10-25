// When a morph plays: its initial delay, its plays and the quiet gaps between
// them, and where each play is at a given moment. A player asks a timeline
// for the playhead at its own logical time and draws the pose at the
// playhead's offset; the timeline holds no clock of its own, so pausing,
// freezing and resetting are the player's.

import { parseMorphEasing, type MorphEasing } from "./easing";
import { hashText } from "./hash";
import type { MorphTiming } from "./types";

/**
 * Where a morph is. `offset` is the keyframe offset to draw: the play's
 * directed progress mapped once through the morph's easing.
 *
 * - `waiting`: before the first play; the variant rests.
 * - `playing`: partway through play number `play`.
 * - `between`: in the quiet gap after play `play`, holding its end pose.
 * - `done`: a finite sequence has ended and holds its terminal pose.
 * - `off`: the morph never plays (`iterations = 0`, or timing no play can
 *   follow); the variant rests.
 */
export type MorphPlayhead =
  | { phase: "waiting" | "off" }
  | { phase: "playing" | "between"; play: number; offset: number }
  | { phase: "done"; play: number; offset: number };

/**
 * A seeded stream of uniform numbers in [0, 1) (mulberry32). Each logical
 * portrait occurrence draws its gaps from its own stream, so two occurrences
 * never share a schedule and one seed always reproduces one.
 */
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
  /** Start times of the plays drawn so far; play k starts at `starts[k]`. */
  protected starts: number[] = [];

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
    if (this.duration > 0 && this.plays > 0) this.starts.push(this.delay);
  }

  /** The quiet time after play `k`, drawn in play order. */
  protected gapAfter(): number {
    if (!this.gap) return 0;
    return this.gap.min + (this.gap.max - this.gap.min) * this.random();
  }

  /** The directed progress of play `play` at raw progress `p`. */
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

  /** The playhead `t` seconds after the timeline began. */
  at(t: number): MorphPlayhead {
    if (!this.starts.length) return { phase: "off" };
    if (t < this.delay) return { phase: "waiting" };
    const starts = this.starts;
    // Extend the drawn schedule up to `t`; gaps are drawn once, in order, so
    // asking about an earlier moment again answers the same.
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
