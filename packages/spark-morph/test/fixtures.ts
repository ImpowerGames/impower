import { ArcLoop, parsePathData } from "../src/index";
import type { Cubic, Point } from "../src/index";

// Synthetic art at roughly portrait scale (a lash about 100 units wide).
// Every lash is a thin closed ribbon with two pointed tips at its ends.

/** Upper lash, eye open: bows upward. */
export const upperOpen = "M0,50 C30,5 70,5 100,50 C70,25 30,25 0,50Z";
/** Lower lash, eye open: bows downward. */
export const lowerOpen = "M0,50 C30,75 70,75 100,50 C70,85 30,85 0,50Z";
/** The single closed lash both open lashes converge onto. */
export const closedLash = "M0,50 C30,44 70,44 100,50 C70,50 30,50 0,50Z";
/** The closed lash drawn in the opposite winding and starting elsewhere. */
export const closedLashReversed = "M100,50 C70,44 30,44 0,50 C30,50 70,50 100,50Z";
/** A lash tilted about 30 degrees, for the correspondence search. */
export const tiltedOpen = "M0,80 C25,25 60,0 100,20 C65,15 35,40 0,80Z";
export const tiltedClosed = "M0,80 C30,55 65,35 100,20 C65,38 30,58 0,80Z";
/**
 * A crease that rotates past vertical: its open pose runs bottom-left to
 * top-right, its closed pose leans the other way, so sorting tips by x pairs
 * the wrong ends and only the correspondence search keeps the edges from
 * trading sides.
 */
export const rotatingOpen = "M20,80 C35,50 60,30 80,20 C60,38 40,60 20,80Z";
export const rotatingClosed = "M54,90 C50,60 50,40 50,10 C56,40 57,60 54,90Z";
/** A second eye, offset to the right. */
export const shift = (d: string, dx: number, dy: number): string =>
  d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${Number(x) + dx},${Number(y) + dy}`);

export const circle = "M90,50A40,40 0 0 1 50,90A40,40 0 0 1 10,50A40,40 0 0 1 50,10A40,40 0 0 1 90,50Z";
export const square = "M10,10H90V90H10Z";
export const star = "M50,5L61,38L96,38L68,59L79,92L50,72L21,92L32,59L4,38L39,38Z";
/** An off-centre blob whose bounding-box centre differs from its anchor mean. */
export const blob = "M10,10 C60,0 90,20 90,40 C90,60 80,70 60,70 C40,70 10,60 10,40 C10,30 10,20 10,10Z";

export const loop = (d: string, i = 0): Cubic[] => parsePathData(d)[i]!.segments;

/** Largest distance from any point of `pts` to the outline of `target`. */
export function maxDistanceToLoop(pts: Point[], target: Cubic[], samples = 720): number {
  const arc = new ArcLoop(target);
  const ring: Point[] = [];
  for (let i = 0; i < samples; i++) ring.push(arc.pointAt(i / samples));
  let worst = 0;
  for (const p of pts) {
    let best = Infinity;
    for (const q of ring) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < best) best = d;
    }
    if (best > worst) worst = best;
  }
  return worst;
}

export const anchors = (segs: Cubic[]): Point[] => segs.map((s) => s.p0);

/** Progress values a player would reach between eight bake samples. */
export const runtimeProgress = Array.from({ length: 21 }, (_, i) => i / 20);
