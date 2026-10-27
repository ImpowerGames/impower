import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { aperturePathData } from "../../morph/render";
import { blink, portrait } from "./fixtures";

// An ordinary eye: two open lashes meeting at both corners close onto one
// lash.
const UPPER = "M20,50 C50,5 90,5 120,50 C90,25 50,25 20,50Z";
const LOWER = "M20,50 C50,75 90,75 120,50 C90,85 50,85 20,50Z";
const CLOSED = "M20,50 C50,44 90,44 120,50 C90,50 50,50 20,50Z";
const PUPIL = "M62,45 C62,33 82,33 82,45 C82,57 62,57 62,45Z";

// Lashes shaped like drawn ones, whose inner edges dip and swell.
const UPPER_SHAPED = "M20,50 C40,15 95,0 120,45 C110,40 100,24 85,26 C70,28 60,36 45,34 C35,33 28,44 20,50Z";
const LOWER_SHAPED = "M20,50 C30,52 45,60 60,58 C80,56 100,62 120,45 C95,72 50,75 20,50Z";
const CLOSED_SHAPED = "M20,50 C50,46 90,42 120,45 C90,48 50,52 20,50Z";
const WHITE_SHAPED = "M20,50 C40,15 95,0 120,45 C95,72 50,75 20,50Z";

// A lower lash whose inner tip stops short of the upper lash's, so the
// aperture has a corner cap.
const LOWER_SHORT = "M40,64 C50,64 55,61 65,60 C85,58 100,62 120,45 C100,72 60,78 40,64Z";
const WHITE_SHORT = "M20,50 C40,15 95,0 120,45 C100,72 60,78 40,64 C28,66 18,60 20,50Z";

// A tilted eye whose resampled near-closed sample folds across itself.
const UPPER_TILTED = "M21.939,46.577 C51.902,7.478 100.433,8.137 119.625,56.075 C93.345,38.003 47.202,35.453 21.939,46.577Z";
const LOWER_TILTED = "M21.939,46.577 C53.935,82.483 95.031,82.652 119.625,56.075 C80.81,71.461 48.642,70.937 21.939,46.577Z";
const CLOSED_TILTED = "M21.939,46.577 C49.922,49.421 94.197,56.743 119.625,56.075 C93.61,57.865 50.04,53.646 21.939,46.577Z";
const WHITE_TILTED = "M21.939,46.577 C55.133,7.78 94.208,11.579 119.625,56.075 C87.283,85.748 48.209,81.949 21.939,46.577Z";

const eye = (white: string, lower: string, upper = UPPER, closed = CLOSED) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100" width="140" height="100">
<path data-name="face" d="M0,0H140V100H0Z" fill="#c96"/>
<g data-name="eyes.open:default">
<path data-name="eyeball-white-left" d="${white}" fill="#fff"/>
<path data-name="pupil-left" d="${PUPIL}" fill="#234"/>
<path data-name="eyelash-left" d="${upper}" fill="#111"/>
<path data-name="eyelash-left" d="${lower}" fill="#111"/>
</g>
<g data-name="eyes.closed">
<path data-name="eyelash-left" d="${closed}" fill="#111"/>
</g>
</svg>`;

// A transform under which a baked ordinary eye's blend, at path-data
// precision, runs one of its points through one of its own segments.
const TRANSFORM = "translate(3.2778109004721045 0.549788058269769) rotate(29.955340940505266) skewX(-1.6249626385979354) scale(0.5764017971232533)";
const transformed = (svg: string, transform: string) => svg.replace(/(<svg[^>]*>)([\s\S]*)(<\/svg>)/, `$1<g transform="${transform}">$2</g>$3`);

type P = [number, number];

/** The loops of an aperture's path data, as `aperturePathData` writes it. */
const loopsOf = (d: string): P[][] =>
  d
    .split("Z")
    .filter((s) => s.trim())
    .map((s) => [...s.matchAll(/[ML](-?[\d.e+-]+),(-?[\d.e+-]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as P));

const pointsOf = (flat: number[]): P[] => {
  const pts: P[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i]!, flat[i + 1]!]);
  return pts;
};

const EPS = 1e-9;
const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const same = (a: P, b: P) => a[0] === b[0] && a[1] === b[1];
/** Which side of the line `a`–`b` the point `q` is on, 0 within rounding of it. */
const sideOf = (a: P, b: P, q: P) => {
  const c = cross(a, b, q);
  return Math.abs(c) <= EPS * Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(q[0] - a[0], q[1] - a[1]) ? 0 : Math.sign(c);
};

/**
 * Whether a closed polyline crosses itself. Two segments cross when each
 * passes strictly between the other's ends. A point lying inside another
 * segment crosses it when the points before and after it (skipping any at
 * the same place) lie strictly on opposite sides; two points at one place
 * cross when the directions to one's neighbours fall strictly on different
 * sides of the other's path through it. Touching, and running along the
 * same line (a closed slit traced out and back), are not crossings.
 */
const crosses = (pts: P[]): boolean => {
  const n = pts.length;
  const around = (k: number): [P, P] | undefined => {
    const find = (step: number) => {
      for (let s = 1; s < n; s++) {
        const p = pts[(((k + step * s) % n) + n) % n]!;
        if (!same(p, pts[k]!)) return p;
      }
      return undefined;
    };
    const before = find(-1),
      after = find(1);
    return before && after ? [before, after] : undefined;
  };
  for (let i = 0; i < n; i++) {
    const a = pts[i]!,
      b = pts[(i + 1) % n]!;
    for (let j = 0; j < n; j++) {
      if (j === i || j === (i + 1) % n || j === (i - 1 + n) % n) continue;
      const c = pts[j]!,
        d = pts[(j + 1) % n]!;
      if (j > i && !(i === 0 && j === n - 1)) {
        const s1 = sideOf(a, b, c),
          s2 = sideOf(a, b, d),
          s3 = sideOf(c, d, a),
          s4 = sideOf(c, d, b);
        if (s1 * s2 < 0 && s3 * s4 < 0) return true;
      }
      // Point j inside segment i.
      const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
      if (len2 > 0 && sideOf(a, b, c) === 0) {
        const along = ((c[0] - a[0]) * (b[0] - a[0]) + (c[1] - a[1]) * (b[1] - a[1])) / len2;
        const near = around(j);
        if (along > EPS && along < 1 - EPS && near && sideOf(a, b, near[0]) * sideOf(a, b, near[1]) < 0) return true;
      }
    }
  }
  // Two points at one place.
  for (let k = 0; k < n; k++)
    for (let m = k + 2; m < n; m++) {
      if ((k === 0 && m === n - 1) || !same(pts[k]!, pts[m]!)) continue;
      const p = around(k),
        q = around(m);
      if (!p || !q) continue;
      const v = pts[k]!;
      // The path p0 → v → p1 bends one way; a direction lies on its left
      // when it is left of both legs at a left bend, or of either at a right.
      const bend = sideOf(p[0], v, p[1]);
      const left = (r: P) => {
        const l1 = sideOf(p[0], v, r),
          l2 = sideOf(v, p[1], r);
        if (l1 === 0 || l2 === 0) return 0;
        if (bend >= 0) return l1 > 0 && l2 > 0 ? 1 : -1;
        return l1 > 0 || l2 > 0 ? 1 : -1;
      };
      if (left(q[0]) * left(q[1]) < 0) return true;
    }
  return false;
};

const STEPS = 1000;

/**
 * Bakes the art and draws every aperture at `STEPS + 1` progress values in
 * both directions, counting the drawings that cross themselves, and the
 * stored samples that do.
 */
const measure = (svg: string, right = false) => {
  const art = bakeMorphArtifact({ source: svg, selection: {}, recipe: blink({}, right), key: "k", variant: "v" });
  expect(art.status, JSON.stringify(art.diagnostics)).toBe("live");
  let blends = 0,
    samples = 0;
  art.apertures.forEach((table, index) => {
    for (const sample of table) for (const loop of sample) if (crosses(pointsOf(loop))) samples++;
    for (const reversed of [false, true]) {
      for (let k = 0; k <= STEPS; k++) {
        if (loopsOf(aperturePathData(table, { index, reversed }, k / STEPS)).some(crosses)) blends++;
      }
    }
  });
  return { blends, samples };
};

describe("a blended aperture", () => {
  test.each<[string, string, boolean]>([
    ["an ordinary eye", eye(UPPER, LOWER), false],
    ["lashes shaped like drawn ones", eye(WHITE_SHAPED, LOWER_SHAPED, UPPER_SHAPED, CLOSED_SHAPED), false],
    ["a lower lash that stops short", eye(WHITE_SHORT, LOWER_SHORT, UPPER_SHAPED, CLOSED_SHAPED), false],
    ["a tilted eye", eye(WHITE_TILTED, LOWER_TILTED, UPPER_TILTED, CLOSED_TILTED), false],
    ["two eyes in one portrait", portrait({ right: true }), true],
    ["a rotated, skewed and scaled portrait", transformed(portrait(), TRANSFORM), false],
  ])("does not cross itself between baked samples: %s", (_, svg, right) => {
    expect(measure(svg, right)).toEqual({ blends: 0, samples: 0 });
  });

  test("does not cross itself where a blend passes through one of its own points", () => {
    // Two simple samples whose blend at 1/14 runs a point through the
    // closing segment: (10,10) lies inside (11,10.5)-(8,9) with its
    // neighbours on opposite sides.
    const a = [0, 4, 3, 0, 13, 14, 17, 19, 3, 9];
    const b = [16, 14, 1, 8, 7, 6, 8, 7, 19, 12];
    const table = [[a], ...Array.from({ length: 7 }, () => [b])];
    expect([a, b].map((loop) => crosses(pointsOf(loop)))).toEqual([false, false]);
    expect(crosses([[8, 9], [2, 4], [10, 10], [12.5, 13], [11, 10.5]])).toBe(true);
    let blends = 0;
    for (let k = 0; k <= STEPS; k++) if (loopsOf(aperturePathData(table, { index: 0, reversed: false }, k / STEPS)).some(crosses)) blends++;
    expect(loopsOf(aperturePathData(table, { index: 0, reversed: false }, 1 / 14)).some(crosses)).toBe(false);
    expect(blends).toBe(0);
  });

  test("draws a closed slit as the blend of its samples", () => {
    // A closed aperture is its midline traced out and back; the two runs
    // lie on one another and do not cross.
    const a = [0, 0, 10, 1, 20, 0, 20, 0, 10, 1, 0, 0];
    const b = [0, 2, 10, 3, 20, 2, 20, 2, 10, 3, 0, 2];
    const table = [[a], [b], [b], [b], [b], [b], [b], [b]];
    expect(aperturePathData(table, { index: 0, reversed: false }, 0.5 / 7)).toBe("M0,1L10,2L20,1L20,1L10,2L0,1Z");
  });
});
