import { describe, expect, test } from "vitest";
import {
  SEGMENT_STRIDE,
  frameToPathData,
  interpolateSamples,
  morphSubpaths,
  parsePathData,
  sampleMorph,
  serializePathData,
  unpackFrame,
} from "../src/index";
import type { SubpathMorph } from "../src/index";
import { closedLash, upperOpen, circle, square } from "./fixtures";

const ribbon = (): SubpathMorph => {
  const r = morphSubpaths(parsePathData(upperOpen), parsePathData(closedLash), { method: "ribbon" });
  if (!r.ok) throw new Error(r.failure.message);
  return r.morph;
};

describe("sampleMorph", () => {
  test("frames share one layout and keep the authored endpoints as path data", () => {
    const s = sampleMorph(ribbon(), 8);
    expect(s.count).toBe(8);
    expect(s.frames).toHaveLength(8);
    const len = s.segmentCounts.reduce((a, b) => a + b, 0) * SEGMENT_STRIDE;
    for (const f of s.frames) expect(f.length).toBe(len);
    expect(s.from).toBe(serializePathData(parsePathData(upperOpen)));
    expect(s.to).toBe(serializePathData(parsePathData(closedLash)));
  });

  test("compound morphs keep one count per subpath", () => {
    const r = morphSubpaths(parsePathData(square + circle), parsePathData(circle + square), { method: "shape" });
    if (!r.ok) throw new Error(r.failure.message);
    const s = sampleMorph(r.morph, 4);
    expect(s.segmentCounts).toHaveLength(2);
    expect(s.closed).toEqual([true, true]);
    expect(unpackFrame(s, s.frames[0]!)).toEqual(r.morph.frame(0));
  });
});

describe("interpolateSamples", () => {
  test("returns the exact frame at a sample and the linear blend between two, without easing", () => {
    const s = sampleMorph(ribbon(), 8);
    expect(Array.from(interpolateSamples(s, 0))).toEqual(Array.from(s.frames[0]!));
    expect(Array.from(interpolateSamples(s, 1))).toEqual(Array.from(s.frames[7]!));
    expect(Array.from(interpolateSamples(s, 3 / 7))).toEqual(Array.from(s.frames[3]!));
    const mid = interpolateSamples(s, 3.5 / 7);
    for (let k = 0; k < mid.length; k++) expect(mid[k]).toBeCloseTo((s.frames[3]![k]! + s.frames[4]![k]!) / 2, 9);
    // Clamped outside the range.
    expect(Array.from(interpolateSamples(s, -1))).toEqual(Array.from(s.frames[0]!));
    expect(Array.from(interpolateSamples(s, 2))).toEqual(Array.from(s.frames[7]!));
  });

  test("reuses the caller's buffer", () => {
    const s = sampleMorph(ribbon(), 8);
    const buf = new Float64Array(s.frames[0]!.length);
    expect(interpolateSamples(s, 0.2, buf)).toBe(buf);
  });

  test("produces path data straight from numbers", () => {
    const s = sampleMorph(ribbon(), 8);
    const d = frameToPathData(s, interpolateSamples(s, 0.3));
    expect(d).toMatch(/^M-?\d/);
    expect(d.endsWith("Z")).toBe(true);
    expect(parsePathData(d)[0]!.segments).toHaveLength(s.segmentCounts[0]!);
  });
});

describe("sample policy", () => {
  // Quality of the linear blend between samples against the exact frame at
  // the same progress, for the lash fixture. This is the measurement behind
  // the initial eight-sample tuning point: the numbers are logged so later
  // tuning can compare, and the assertion pins that eight samples keep the
  // worst deviation under half a unit on a hundred-unit lash.
  test("eight samples keep the blend within half a unit of the exact frame", () => {
    const morph = ribbon();
    const report: Record<number, number> = {};
    for (const count of [4, 8, 16]) {
      const s = sampleMorph(morph, count);
      let worst = 0;
      for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        const exact = sampleMorph({ ...morph, frame: () => morph.frame(t) }, 2).frames[0]!;
        const blend = interpolateSamples(s, t);
        for (let k = 0; k < exact.length; k += 2) {
          worst = Math.max(worst, Math.hypot(exact[k]! - blend[k]!, exact[k + 1]! - blend[k + 1]!));
        }
      }
      report[count] = worst;
    }
    console.log("worst blend deviation by sample count (user units)", report);
    expect(report[8]).toBeLessThan(0.5);
    expect(report[16]).toBeLessThanOrEqual(report[8]!);
  });
});
