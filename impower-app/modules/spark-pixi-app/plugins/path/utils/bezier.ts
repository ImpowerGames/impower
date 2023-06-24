/*
 * Based on bezier-easing <https://github.com/thednp/bezier-easing>
 *
 * Copyright (c) 2020 thednp
 * Released under the MIT license.
 */

export const sampleCurveX = (
  t: number,
  ax: number,
  bx: number,
  cx: number
): number => {
  return ((ax * t + bx) * t + cx) * t;
};

export const sampleCurveY = (
  t: number,
  ay: number,
  by: number,
  cy: number
): number => {
  return ((ay * t + by) * t + cy) * t;
};

const sampleCurveDerivativeX = (
  t: number,
  ax: number,
  bx: number,
  cx: number
): number => {
  return (3 * ax * t + 2 * bx) * t + cx;
};

const solveCurveX = (x: number, ax: number, bx: number, cx: number): number => {
  const epsilon = 1e-6;

  if (x <= 0) {
    return 0;
  }
  if (x >= 1) {
    return 1;
  }

  let t2 = x;
  let x2 = 0;
  let d2 = 0;

  // First try a few iterations of Newton's method
  // -- usually very fast.
  for (let i = 0; i < 8; i += 1) {
    x2 = sampleCurveX(t2, ax, bx, cx) - x;
    if (Math.abs(x2) < epsilon) {
      return t2;
    }
    d2 = sampleCurveDerivativeX(t2, ax, bx, cx);
    if (Math.abs(d2) < epsilon) {
      break;
    }
    t2 -= x2 / d2;
  }

  let t0 = 0;
  let t1 = 1;
  t2 = x;

  while (t0 < t1) {
    x2 = sampleCurveX(t2, ax, bx, cx);
    if (Math.abs(x2 - x) < epsilon) {
      return t2;
    }
    if (x > x2) {
      t0 = t2;
    } else {
      t1 = t2;
    }

    t2 = (t1 - t0) * 0.5 + t0;
  }

  return t2;
};

/**
 * @constructor
 * @param x1 - first control point horizontal position
 * @param y1 - first control point vertical position
 * @param x2 - second control point horizontal position
 * @param y2 - second control point vertical position
 * @returns a new CubicBezier easing function
 */
export const bezier = (
  x1?: number,
  y1?: number,
  x2?: number,
  y2?: number
): ((t: number) => number) => {
  const p1x = x1 ?? 0;
  const p1y = y1 ?? 0;
  const p2x = x2 ?? 1;
  const p2y = y2 ?? 1;

  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  return (t: number) => sampleCurveY(solveCurveX(t, ax, bx, cx), ay, by, cy);
};
