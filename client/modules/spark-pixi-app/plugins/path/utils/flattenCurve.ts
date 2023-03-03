/**
 * bezier-points <https://github.com/pshihn/bezier-points>
 *
 * Copyright (c) 2020 Preet Shihn
 * Released under the MIT License.
 */

import { Curve } from "../types/Curve";
import { Point } from "../types/Point";

const clone = (p: Point): Point => {
  return [...p] as Point;
};

export const curveToBezier = (curve: Curve, curveTightness = 0): Curve => {
  const len = curve.length;
  if (len < 3) {
    throw new Error("A curve must have at least three points.");
  }
  const out: Point[] = [];
  if (len === 3) {
    out.push(
      clone(curve[0]),
      clone(curve[1]),
      clone(curve[2]),
      clone(curve[2])
    );
  } else {
    const points: Point[] = [];
    points.push(curve[0], curve[0]);
    for (let i = 1; i < curve.length; i += 1) {
      points.push(curve[i]);
      if (i === curve.length - 1) {
        points.push(curve[i]);
      }
    }
    const b: Point[] = [];
    const s = 1 - curveTightness;
    out.push(clone(points[0]));
    for (let i = 1; i + 2 < points.length; i += 1) {
      const cachedVertArray = points[i];
      b[0] = [cachedVertArray[0], cachedVertArray[1]];
      b[1] = [
        cachedVertArray[0] + (s * points[i + 1][0] - s * points[i - 1][0]) / 6,
        cachedVertArray[1] + (s * points[i + 1][1] - s * points[i - 1][1]) / 6,
      ];
      b[2] = [
        points[i + 1][0] + (s * points[i][0] - s * points[i + 2][0]) / 6,
        points[i + 1][1] + (s * points[i][1] - s * points[i + 2][1]) / 6,
      ];
      b[3] = [points[i + 1][0], points[i + 1][1]];
      out.push(b[1], b[2], b[3]);
    }
  }
  return out;
};

// distance between 2 points squared
const distanceSq = (p1: Point, p2: Point): number => {
  return (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2;
};

// distance between 2 points
const distance = (p1: Point, p2: Point): number => {
  return Math.sqrt(distanceSq(p1, p2));
};

const lerp = (a: Point, b: Point, t: number): Point => {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};

// Sistance squared from a point p to the line segment vw
const distanceToSegmentSq = (p: Point, v: Point, w: Point): number => {
  const l2 = distanceSq(v, w);
  if (l2 === 0) {
    return distanceSq(p, v);
  }
  let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
  t = Math.max(0, Math.min(1, t));
  return distanceSq(p, lerp(v, w, t));
};

// Adapted from https://seant23.wordpress.com/2010/11/12/offset-bezier-curves/
const flatness = (points: Curve, offset: number): number => {
  const p1 = points[offset + 0];
  const p2 = points[offset + 1];
  const p3 = points[offset + 2];
  const p4 = points[offset + 3];

  let ux = 3 * p2[0] - 2 * p1[0] - p4[0];
  ux *= ux;
  let uy = 3 * p2[1] - 2 * p1[1] - p4[1];
  uy *= uy;
  let vx = 3 * p3[0] - 2 * p4[0] - p1[0];
  vx *= vx;
  let vy = 3 * p3[1] - 2 * p4[1] - p1[1];
  vy *= vy;

  if (ux < vx) {
    ux = vx;
  }

  if (uy < vy) {
    uy = vy;
  }

  return ux + uy;
};

const getPointsOnBezierCurveWithSplitting = (
  points: Curve,
  offset: number,
  tolerance: number,
  newPoints?: Point[]
): Point[] => {
  const outPoints = newPoints || [];
  if (flatness(points, offset) < tolerance) {
    const p0 = points[offset + 0];
    if (outPoints.length) {
      const d = distance(outPoints[outPoints.length - 1], p0);
      if (d > 1) {
        outPoints.push(p0);
      }
    } else {
      outPoints.push(p0);
    }
    outPoints.push(points[offset + 3]);
  } else {
    // subdivide
    const t = 0.5;
    const p1 = points[offset + 0];
    const p2 = points[offset + 1];
    const p3 = points[offset + 2];
    const p4 = points[offset + 3];

    const q1 = lerp(p1, p2, t);
    const q2 = lerp(p2, p3, t);
    const q3 = lerp(p3, p4, t);

    const r1 = lerp(q1, q2, t);
    const r2 = lerp(q2, q3, t);

    const red = lerp(r1, r2, t);

    getPointsOnBezierCurveWithSplitting(
      [p1, q1, r1, red],
      0,
      tolerance,
      outPoints
    );
    getPointsOnBezierCurveWithSplitting(
      [red, r2, q3, p4],
      0,
      tolerance,
      outPoints
    );
  }
  return outPoints;
};

// Ramer–Douglas–Peucker algorithm
// https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
const simplifyPoints = (
  points: Curve,
  start: number,
  end: number,
  epsilon: number,
  newPoints?: Point[]
): Point[] => {
  const outPoints = newPoints || [];

  // find the most distance point from the endpoints
  const s = points[start];
  const e = points[end - 1];
  let maxDistSq = 0;
  let maxNdx = 1;
  for (let i = start + 1; i < end - 1; i += 1) {
    const distSq = distanceToSegmentSq(points[i], s, e);
    if (distSq > maxDistSq) {
      maxDistSq = distSq;
      maxNdx = i;
    }
  }

  // if that point is too far, split
  if (Math.sqrt(maxDistSq) > epsilon) {
    simplifyPoints(points, start, maxNdx + 1, epsilon, outPoints);
    simplifyPoints(points, maxNdx, end, epsilon, outPoints);
  } else {
    if (!outPoints.length) {
      outPoints.push(s);
    }
    outPoints.push(e);
  }

  return outPoints;
};

export const simplify = (points: Curve, distance: number): Point[] => {
  return simplifyPoints(points, 0, points.length, distance);
};

export const flattenCurve = (
  points: Curve,
  tolerance = 0.15,
  distance = 0
): Point[] => {
  const newPoints: Point[] = [];
  const numSegments = (points.length - 1) / 3;
  for (let i = 0; i < numSegments; i += 1) {
    const offset = i * 3;
    getPointsOnBezierCurveWithSplitting(points, offset, tolerance, newPoints);
  }
  if (distance && distance > 0) {
    return simplifyPoints(newPoints, 0, newPoints.length, distance);
  }
  return newPoints;
};
