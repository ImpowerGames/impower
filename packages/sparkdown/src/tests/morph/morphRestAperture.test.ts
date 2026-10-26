import { flattenCubic } from "@impower/spark-morph/src/geometry/cubic";
import { parsePathData } from "@impower/spark-morph/src/index";
import { describe, expect, test } from "vitest";
import { filterSVGAttributes } from "../../attributes";
import { bakeMorphArtifact } from "../../morph/bake";
import { parse } from "../../txml/txml";
import { blink } from "./fixtures";

// Lashes shaped like drawn ones: the upper lash's inner edge dips and rises
// again and the lower lash's inner edge swells, so a few-anchor taper fitted
// to them cuts across the opening they draw. The white runs under both lashes
// to their outer edges, as eye whites are drawn, and the lashes paint over it.
const UPPER = "M20,50 C40,15 95,0 120,45 C110,40 100,24 85,26 C70,28 60,36 45,34 C35,33 28,44 20,50Z";
const LOWER = "M20,50 C30,52 45,60 60,58 C80,56 100,62 120,45 C95,72 50,75 20,50Z";
const CLOSED = "M20,50 C50,46 90,42 120,45 C90,48 50,52 20,50Z";
const WHITE = "M20,50 C40,15 95,0 120,45 C95,72 50,75 20,50Z";
const PUPIL = "M62,45 C62,33 82,33 82,45 C82,57 62,57 62,45Z";

// A lower lash whose inner tip stops 24 units short of the upper lash's, so
// the open lashes' corner tips do not meet, as drawn on some portraits. The
// white runs under it to its outer edge and bulges past the straight line
// between the two tips, where no lash covers it.
const LOWER_SHORT = "M40,64 C50,64 55,61 65,60 C85,58 100,62 120,45 C100,72 60,78 40,64Z";
const WHITE_SHORT = "M20,50 C40,15 95,0 120,45 C100,72 60,78 40,64 C28,66 18,60 20,50Z";

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

type Point = [number, number];
type Element = { tagName: string; attributes: Record<string, string>; children: unknown[] };

const rings = (d: string): Point[][] =>
  parsePathData(d).map((s) => s.segments.flatMap((c, i) => flattenCubic(c, 32).slice(i ? 1 : 0)) as Point[]);

const inside = (shape: Point[][], [x, y]: Point): boolean => {
  let crossings = false;
  for (const ring of shape) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!,
        [xj, yj] = ring[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) crossings = !crossings;
    }
  }
  return crossings;
};

const distance = (shape: Point[][], p: Point): number => {
  let best = Infinity;
  for (const ring of shape) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!,
        b = ring[(i + 1) % ring.length]!;
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]));
    }
  }
  return best;
};

/** A filled path in paint order, with the clip paths that wrap it. */
interface Painted {
  fill: string;
  shape: Point[][];
  clips: Point[][][];
}

/**
 * The SVG's filled paths in paint order, each with its ancestors' clip
 * paths resolved. The sampler has no transforms, so it refuses any.
 */
const paintList = (svg: string): Painted[] => {
  const doc = parse(svg);
  const roots = (Array.isArray(doc) ? doc : [doc]) as Element[];
  const clipById = new Map<string, Point[][]>();
  const walkClips = (node: Element) => {
    if (node.tagName === "clipPath") {
      const path = node.children.find((c): c is Element => !!c && typeof c === "object") as Element;
      clipById.set(node.attributes["id"]!, rings(path.attributes["d"]!));
    }
    for (const c of node.children) if (c && typeof c === "object") walkClips(c as Element);
  };
  roots.forEach(walkClips);
  const out: Painted[] = [];
  const walk = (node: Element, clips: Point[][][]) => {
    if (node.tagName === "defs" || node.tagName === "clipPath") return;
    expect(node.attributes["transform"], "the sampler draws untransformed art").toBeUndefined();
    const ref = /url\(#([^)]+)\)/.exec(node.attributes["clip-path"] ?? "")?.[1];
    const own = ref ? [...clips, clipById.get(ref)!] : clips;
    if (node.tagName === "path" && node.attributes["fill"]) {
      out.push({ fill: node.attributes["fill"], shape: rings(node.attributes["d"]!), clips: own });
    }
    for (const c of node.children) if (c && typeof c === "object") walk(c as Element, own);
  };
  roots.forEach((r) => walk(r, []));
  return out;
};

const colourAt = (list: Painted[], p: Point): string => {
  let colour = "none";
  for (const item of list) {
    if (inside(item.shape, p) && item.clips.every((clip) => inside(clip, p))) colour = item.fill;
  }
  return colour;
};

describe("a live morph's rest render", () => {
  test.each([
    ["lashes that meet at both corners", eye(WHITE, LOWER)],
    ["open lashes whose inner corner tips do not meet", eye(WHITE_SHORT, LOWER_SHORT)],
    [
      "a lower lash starting above the upper lash's tip",
      eye("M20,50 C40,15 95,0 120,45 C92,85 60,88 35,47 L20,50Z", "M35,47 C65,70 95,75 120,45 C92,85 60,88 35,47Z"),
    ],
  ])("looks the same as the variant's static image away from the drawn outlines: %s", (_name, SVG) => {
    const artifact = bakeMorphArtifact({ source: SVG, selection: {}, recipe: blink(), key: "k", variant: "bunny" });
    expect(artifact.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(artifact.status).toBe("live");
    const rest = paintList(artifact.rest);
    const still = paintList(filterSVGAttributes(SVG, {}));
    // The rest render does clip its targets, so the comparison is not vacuous.
    expect(rest.some((item) => item.clips.length > 0)).toBe(true);
    // Points within antialiasing reach of a drawn outline may differ: there
    // the clip edge meets the lash edge, which a rasterizer blends.
    const outlines = still.flatMap((item) => item.shape);
    const differing: string[] = [];
    let compared = 0;
    for (let x = 0; x <= 140; x += 0.5) {
      for (let y = 0; y <= 100; y += 0.5) {
        const p: Point = [x, y];
        if (distance(outlines, p) < 0.75) continue;
        compared++;
        const a = colourAt(rest, p),
          b = colourAt(still, p);
        if (a !== b) differing.push(`(${x}, ${y}) rest ${a} static ${b}`);
      }
    }
    expect(compared).toBeGreaterThan(25000);
    expect(differing.slice(0, 5), `${differing.length} points differ`).toEqual([]);
  });
});

/** Whether a closed polyline has a proper crossing; a closed stretch's collinear slit is not one. */
const properlyCrosses = (pts: Point[]): boolean => {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!];
      const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
      if (den === 0) continue;
      const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den,
        u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
      if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) return true;
    }
  }
  return false;
};

describe("a live morph's baked apertures", () => {
  test("never cross themselves where open lashes whose tips do not meet pass each other", () => {
    // A lower lash starting inside the opening, short of the upper lash's
    // tip: closing, its inner end passes the upper lash's boundary before the
    // samples of the two boundaries do.
    const upper = "M20,50 C50,5 90,5 120,50 C90,25 50,25 20,50Z";
    const lower = "M45,40 C60,52 95,78 120,50 C92,88 60,60 45,40Z";
    const closed = "M20,50 C50,44 90,44 120,50 C90,50 50,50 20,50Z";
    const white = "M20,50 C50,5 90,5 120,50 C92,88 60,60 45,40 L20,50Z";
    const artifact = bakeMorphArtifact({ source: eye(white, lower, upper, closed), selection: {}, recipe: blink(), key: "k", variant: "bunny" });
    expect(artifact.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(artifact.status).toBe("live");
    expect(artifact.apertures.length).toBeGreaterThan(0);
    const crossed: string[] = [];
    artifact.apertures.forEach((samples, a) =>
      samples.forEach((loops, s) =>
        loops.forEach((flat, l) => {
          const pts: Point[] = [];
          for (let k = 0; k + 1 < flat.length; k += 2) pts.push([flat[k]!, flat[k + 1]!]);
          if (properlyCrosses(pts)) crossed.push(`aperture ${a} sample ${s} loop ${l}`);
        }),
      ),
    );
    expect(crossed).toEqual([]);
  });
});
