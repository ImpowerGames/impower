import { describe, expect, test } from "vitest";
import { buildApertures, morphSubpaths, taperTrack } from "../src/index";
import type { MorphMethod } from "../src/index";
import {
  circle,
  closedLash,
  loop,
  lowerOpen,
  offKilterQuad,
  oneCusp,
  oneCuspNarrow,
  roundedClosed,
  roundedOpen,
  rotatingClosed,
  rotatingOpen,
  scaled,
  square,
  star,
  upperOpen,
} from "./fixtures";

// Every tolerance is a fraction of the drawing's own size, so the same art
// at a hundredth or a hundred times the scale must produce the same
// outcome: the same success or failure code, the same thickness ratio, the
// same aperture pairing. A tolerance that were still an absolute number of
// user units would break one end of this range.
const SCALES = [0.01, 1, 100];

describe("scale invariance", () => {
  const cases: [string, string, string, MorphMethod][] = [
    ["taper: upper lash", upperOpen, closedLash, "taper"],
    ["taper: rotating crease", rotatingOpen, rotatingClosed, "taper"],
    ["taper: rounded tips", roundedOpen, roundedClosed, "taper"],
    ["taper: one cusp (fails)", oneCusp, oneCuspNarrow, "taper"],
    ["taper: circle (fails)", circle, closedLash, "taper"],
    ["outline: square to star", square, star, "outline"],
    ["outline: star to circle", star, circle, "outline"],
    ["nodes: square to quadrilateral", square, offKilterQuad, "nodes"],
    ["still: identical lashes", upperOpen, upperOpen, "taper"],
  ];
  for (const [name, from, to, method] of cases) {
    test(`${name}: the same outcome at every scale`, () => {
      const outcomes = SCALES.map((k) => {
        const r = morphSubpaths([{ segments: loop(scaled(from, k)), closed: true }], [{ segments: loop(scaled(to, k)), closed: true }], { method });
        return r.ok ? `ok:${r.morph.method}` : `fail:${r.failure.code}`;
      });
      expect(new Set(outcomes).size, outcomes.join(" | ")).toBe(1);
    });
  }

  test("taper thickness ratios agree across scales", () => {
    const ratios = SCALES.map((k) => {
      const r = taperTrack(loop(scaled(upperOpen, k)), loop(scaled(closedLash, k)));
      if (!r.ok) throw new Error(r.failure.message);
      return r.track.thickness;
    });
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[1]!, 3);
  });

  test("aperture pairing and relative area agree across scales", () => {
    const areas = SCALES.map((k) => {
      const u = taperTrack(loop(scaled(upperOpen, k)), loop(scaled(closedLash, k)));
      const l = taperTrack(loop(scaled(lowerOpen, k)), loop(scaled(closedLash, k)));
      if (!u.ok || !l.ok) throw new Error("taper failed");
      const r = buildApertures([
        { id: "u", label: "l", track: u.track },
        { id: "l", label: "l", track: l.track },
      ]);
      expect(r.diagnostics).toEqual([]);
      expect(r.apertures).toHaveLength(1);
      return r.apertures[0]!.area(0.5) / r.apertures[0]!.area(0);
    });
    for (const a of areas) expect(a).toBeCloseTo(areas[1]!, 3);
  });
});
