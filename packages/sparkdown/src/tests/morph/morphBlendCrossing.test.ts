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

/**
 * Whether two non-adjacent segments of a closed polyline cross properly:
 * each passes strictly between the other's ends. A point that lies on
 * another segment touches it and does not cross it.
 */
const crosses = (pts: P[]): boolean => {
  const n = pts.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!];
      const rx = b[0] - a[0],
        ry = b[1] - a[1],
        sx = d[0] - c[0],
        sy = d[1] - c[1],
        den = rx * sy - ry * sx;
      if (den === 0) continue;
      const wx = c[0] - a[0],
        wy = c[1] - a[1];
      const t = (wx * sy - wy * sx) / den,
        u = (wx * ry - wy * rx) / den;
      if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) return true;
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
  ])("does not cross itself between baked samples: %s", (_, svg, right) => {
    expect(measure(svg, right)).toEqual({ blends: 0, samples: 0 });
  });
});
