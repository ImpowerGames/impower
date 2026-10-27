import { flattenCubic } from "@impower/spark-morph/src/geometry/cubic";
import { parsePathData } from "@impower/spark-morph/src/index";
import { describe, expect, test } from "vitest";
import { filterSVGAttributes } from "../../attributes";
import { applyPoint, invert, multiply, parseTransform, IDENTITY, type Affine } from "../../morph/affine";
import { bakeMorphArtifact } from "../../morph/bake";
import { renderMorphAt } from "../../morph/render";
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

/** A filled path in paint order, in root space, with how much of it the clips and masks that wrap it let through. */
interface Painted {
  fill: string;
  shape: Point[][];
  clips: ((p: Point) => number)[];
}

const elementChildren = (node: Element) => node.children.filter((c): c is Element => !!c && typeof c === "object");

const hidden = (node: Element) => node.attributes["display"] === "none" || /display:\s*none/.test(node.attributes["style"] ?? "");

const transformOf = (node: Element): Affine => parseTransform(node.attributes["transform"])!;

const mapRings = (m: Affine, shape: Point[][]): Point[][] => shape.map((ring) => ring.map((point) => applyPoint(m, point)));

/**
 * The SVG's filled, shown paths in paint order, in root space, each with how
 * much its ancestors' clip paths and masks let through, drawn `scale` screen
 * pixels to the root unit. A clip path or mask is evaluated in the space of
 * the element that refers to it, its own transform included. A mask is
 * modelled as its path's fill and stroke, each as opaque as its paint: the
 * path's own `fill-opacity` and `stroke-opacity`, else the value it inherits
 * from the mask's ancestors, as a mask's content does. A `non-scaling-stroke`
 * reaches half its width in screen pixels measured in that referring
 * element's space, which is how Chromium draws one in a mask: under a
 * referring element scaled 2 against the root, it reaches twice as far on
 * screen.
 */
const paintList = (svg: string, scale = 1): Painted[] => {
  const doc = parse(svg);
  const roots = (Array.isArray(doc) ? doc : [doc]) as Element[];
  const byId = new Map<string, Element>();
  const parentOf = new Map<Element, Element>();
  const index = (node: Element) => {
    if (node.attributes["id"]) byId.set(node.attributes["id"], node);
    for (const child of elementChildren(node)) {
      parentOf.set(child, node);
      index(child);
    }
  };
  roots.forEach(index);
  // A presentation property as it takes effect on `node`: its inline style,
  // its attribute, else its ancestors'.
  const property = (node: Element | undefined, name: string): string | undefined => {
    for (let at = node; at; at = parentOf.get(at)) {
      const inline = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(at.attributes["style"] ?? "")?.[1];
      const value = inline ?? at.attributes[name];
      if (value !== undefined) return value.trim();
    }
    return undefined;
  };
  // `space` maps the referring element's space to root space.
  const reveals = (resource: Element, space: Affine): ((p: Point) => number) => {
    const local = invert(space)!;
    if (resource.tagName === "clipPath") {
      const shapes = elementChildren(resource).map((child) => mapRings(transformOf(child), rings(child.attributes["d"] ?? "")));
      return (p) => (shapes.some((shape) => inside(shape, applyPoint(local, p))) ? 1 : 0);
    }
    const path = elementChildren(resource).find((c) => c.tagName === "path")!;
    const fill = path.attributes["d"] ? mapRings(transformOf(path), rings(path.attributes["d"])) : [];
    const paint = (name: string) => {
      const colour = property(path, name);
      return colour === undefined || colour === "none" ? 0 : Number(property(path, `${name}-opacity`) ?? 1);
    };
    const fillAlpha = paint("fill"),
      strokeAlpha = paint("stroke");
    const width = Number(/^([\d.]+)/.exec(property(path, "stroke-width") ?? "1")?.[1]);
    const reach = (property(path, "vector-effect") === "non-scaling-stroke" ? width / scale : width) / 2;
    return (p) => {
      const q = applyPoint(local, p);
      return inside(fill, q) ? fillAlpha : strokeAlpha > 0 && distance(fill, q) <= reach ? strokeAlpha : 0;
    };
  };
  const out: Painted[] = [];
  const walk = (node: Element, clips: ((p: Point) => number)[], parentSpace: Affine) => {
    if (node.tagName === "defs" || node.tagName === "clipPath" || node.tagName === "mask" || hidden(node)) return;
    const space = node.tagName === "svg" ? parentSpace : multiply(parentSpace, transformOf(node));
    const own = [...clips];
    for (const attribute of ["clip-path", "mask"]) {
      const ref = /url\(#([^)]+)\)/.exec(node.attributes[attribute] ?? "")?.[1];
      if (ref) own.push(reveals(byId.get(ref)!, space));
    }
    if (node.tagName === "path" && node.attributes["fill"]) {
      out.push({ fill: node.attributes["fill"], shape: mapRings(space, rings(node.attributes["d"]!)), clips: own });
    }
    for (const c of elementChildren(node)) walk(c, own, space);
  };
  roots.forEach((r) => walk(r, [], IDENTITY));
  return out;
};

/** The colour on top at `p`, with how much of it shows when a mask lets only part of it through. */
const colourAt = (list: Painted[], p: Point): string => {
  let colour = "none";
  for (const item of list) {
    if (!inside(item.shape, p)) continue;
    const through = item.clips.reduce((product, clip) => product * clip(p), 1);
    if (through === 1) colour = item.fill;
    else if (through > 0) colour = `${through} of ${item.fill} over ${colour}`;
  }
  return colour;
};

describe("a live morph's rest render", () => {
  test.each([
    ["lashes that meet at both corners", eye(WHITE, LOWER)],
    ["open lashes whose inner corner tips do not meet", eye(WHITE_SHORT, LOWER_SHORT)],
    [
      "a lower lash whose inner tip points away from the upper lash's",
      eye(WHITE_SHORT, "M40,64 C50,44 55,61 65,60 C85,58 100,62 120,45 C100,72 60,78 40,64Z"),
    ],
    ["white bulging further past the uncovered corner", eye("M20,50 C40,15 95,0 120,45 C100,72 60,78 40,64 C28,70 16,62 20,50Z", LOWER_SHORT)],
    ["white bulging well past the uncovered corner", eye("M20,50 C40,15 95,0 120,45 C100,72 60,78 40,64 C28,76 10,64 20,50Z", LOWER_SHORT)],
    [
      "art whose root sets a fill opacity every drawing overrides",
      eye(WHITE, LOWER)
        .replace('height="100">', 'height="100" fill-opacity="0.5">')
        .replaceAll(' fill="#', ' fill-opacity="1" fill="#'),
    ],
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

describe("a live morph's aperture masks", () => {
  const SVG = eye(WHITE, LOWER);
  const artifact = bakeMorphArtifact({ source: SVG, selection: {}, recipe: blink(), key: "k", variant: "bunny" });

  // The same picture with the white drawn under transforms that leave the
  // still image as it was: a scaled parent the white's own transform undoes.
  const underParent = (parent: string, undo: string) =>
    SVG.replace(
      `<path data-name="eyeball-white-left" d="${WHITE}" fill="#fff"/>`,
      `<g transform="${parent}"><path data-name="eyeball-white-left" transform="${undo}" d="${WHITE}" fill="#fff"/></g>`,
    );
  const FIXTURES: [string, string, number][] = [
    ["plain art", SVG, 1],
    [
      "art drawn whole under scale(2)",
      SVG.replace('viewBox="0 0 140 100" width="140" height="100">', 'viewBox="0 0 280 200" width="140" height="100"><g transform="scale(2)">').replace("</svg>", "</g></svg>"),
      0.5,
    ],
    ["a white under scale(100 1), undone on the white", underParent("scale(100 1)", "scale(0.01 1)"), 1],
    ["a white under scale(10000), undone on the white", underParent("scale(10000)", "scale(0.0001)"), 1],
    ["a white under a rotation and a stretch, undone on the white", underParent("rotate(30 70 50) scale(2 0.5)", "scale(0.5 2) rotate(-30 70 50)"), 1],
  ];

  /** The outline of the aperture an SVG cuts its targets with. */
  const apertureOutline = (svg: string): Point[][] => {
    const doc = parse(svg);
    let d: string | undefined;
    const find = (node: Element) => {
      if (d === undefined && (node.tagName === "mask" || node.tagName === "clipPath") && /^(_m[^_]*_)?morph-clip-\d+-\d+$/.test(node.attributes["id"] ?? "")) {
        d = elementChildren(node).find((c) => c.tagName === "path")?.attributes["d"];
      }
      elementChildren(node).forEach(find);
    };
    ((Array.isArray(doc) ? doc : [doc]) as Element[]).forEach(find);
    return d ? rings(d) : [];
  };

  /**
   * Points `offsets` screen pixels from the outline, on either side, at
   * `scale` screen pixels to the unit, each with whether it lies outside the
   * aperture.
   */
  const nearOutline = (outline: Point[][], scale: number, offsets: number[]) => {
    const points: { p: Point; outside: boolean }[] = [];
    for (const ring of outline) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i]!,
          [bx, by] = ring[(i + 1) % ring.length]!;
        const length = Math.hypot(bx - ax, by - ay);
        if (length < 1e-9) continue;
        const [nx, ny] = [-(by - ay) / length, (bx - ax) / length];
        for (let t = 0.05; t < 1; t += 0.1) {
          for (const offset of offsets) {
            for (const side of [1, -1]) {
              const p: Point = [ax + (bx - ax) * t + side * nx * (offset / scale), ay + (by - ay) * t + side * ny * (offset / scale)];
              points.push({ p, outside: !inside(outline, p) && distance(outline, p) > 0.25 / scale });
            }
          }
        }
      }
    }
    return points;
  };

  test.each(FIXTURES)("reach half a screen pixel past the aperture's outline under the edges: %s", (_name, source, unit) => {
    // The outline lies on the lashes' inner edges, and a clip edge on a drawn
    // edge leaves an antialiased seam of the face under the white. Under the
    // lashes, half a pixel past the outline, the white must still be drawn,
    // so the edge a rasterizer blends is the lash's alone. `unit` is the
    // picture's root units to the plain art's.
    const baked = bakeMorphArtifact({ source, selection: {}, recipe: blink(), key: "k", variant: "bunny" });
    expect(baked.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(baked.status).toBe("live");
    for (const svg of [baked.rest, renderMorphAt(baked, 0)]) {
      for (const scale of [4 * unit, 20 * unit]) {
        const rest = paintList(svg, scale);
        const lashes = rest.filter((item) => item.fill === "#111");
        const white = rest.find((item) => item.fill === "#fff")!;
        const outline = apertureOutline(svg);
        expect(outline.length).toBeGreaterThan(0);
        const underLash = nearOutline(outline, scale, [0.5]).filter(({ p, outside }) => outside && lashes.some((lash) => inside(lash.shape, p)));
        expect(underLash.length).toBeGreaterThan(200);
        const cut = underLash.filter(({ p }) => white.clips.some((clip) => clip(p) < 1));
        expect(cut.slice(0, 5).map(({ p }) => p), `${cut.length} of ${underLash.length} points under the lashes cut at ${scale}px`).toEqual([]);
      }
    }
  });

  test.each(FIXTURES)("at rest, change nothing but toward the static image: %s", (_name, source, unit) => {
    // Where the reach changes what shows, it shows what the static image
    // does: the white running under the lashes.
    const baked = bakeMorphArtifact({ source, selection: {}, recipe: blink(), key: "k", variant: "bunny" });
    for (const svg of [baked.rest, renderMorphAt(baked, 0)]) {
      const outline = apertureOutline(svg);
      expect(outline.length).toBeGreaterThan(0);
      let changes = 0;
      for (const scale of [1 * unit, 4 * unit, 20 * unit]) {
        const reaching = paintList(svg, scale),
          exact = paintList(svg, Infinity),
          still = paintList(filterSVGAttributes(source, {}), scale);
        const points = nearOutline(outline, scale, [0.25, 0.5, 0.75, 1, 1.5]);
        const changed = points.filter(({ p }) => colourAt(reaching, p) !== colourAt(exact, p));
        changes += changed.length;
        const differing = changed
          .filter(({ p }) => colourAt(reaching, p) !== colourAt(still, p))
          .map(({ p }) => `(${p[0].toFixed(3)}, ${p[1].toFixed(3)}) at ${scale}px: ${colourAt(reaching, p)} for ${colourAt(still, p)}`);
        expect(differing.slice(0, 5), `${differing.length} points differ`).toEqual([]);
      }
      // The reach does reach somewhere it shows, so the check is not vacuous.
      expect(changes).toBeGreaterThan(0);
    }
  });

  test.each([
    ["closing", 0.1],
    ["halfway closed", 0.2],
    ["nearly closed", 0.3],
    ["reopening", 0.5],
  ])("reach nowhere past the outline away from rest: %s", (_name, offset) => {
    // Moving edges taper past the opening's corners, where a reach would
    // show the white beyond them.
    const svg = renderMorphAt(artifact, offset);
    const outline = apertureOutline(svg);
    expect(outline.length).toBeGreaterThan(0);
    for (const scale of [1, 4, 20]) {
      const reaching = paintList(svg, scale),
        exact = paintList(svg, Infinity);
      const differing = nearOutline(outline, scale, [0.25, 0.5, 0.75, 1, 1.5])
        .filter(({ p }) => colourAt(reaching, p) !== colourAt(exact, p))
        .map(({ p }) => `(${p[0].toFixed(3)}, ${p[1].toFixed(3)}) at ${scale}px: ${colourAt(reaching, p)} for ${colourAt(exact, p)}`);
      expect(differing.slice(0, 5), `${differing.length} points differ`).toEqual([]);
    }
  });

  test("reach nowhere past a rest outline that encloses no area", () => {
    // A morph that rests closed, on art whose white is drawn outside the eye
    // states and above the closed lash: the closed aperture has no area, so
    // at rest it shows none of the white, reach or not.
    const closedFirst = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100" width="140" height="100">
<path data-name="face" d="M0,0H140V100H0Z" fill="#c96"/>
<g data-name="eyes.open">
<path data-name="eyelash-left" d="${UPPER}" fill="#111"/>
<path data-name="eyelash-left" d="${LOWER}" fill="#111"/>
</g>
<g data-name="eyes.closed:default">
<path data-name="eyelash-left" d="${CLOSED}" fill="#111"/>
</g>
<path data-name="eyeball-white-left" d="${WHITE}" fill="#fff"/>
</svg>`;
    const recipe = blink({
      keyframes: [
        { offset: 0, eyes: { state: "closed" } },
        { offset: 0.5, eyes: { state: "open" } },
        { offset: 1, eyes: { state: "closed" } },
      ],
    });
    const baked = bakeMorphArtifact({ source: closedFirst, selection: {}, recipe, key: "k", variant: "bunny" });
    expect(baked.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(baked.status).toBe("live");
    for (const svg of [baked.rest, renderMorphAt(baked, 0), renderMorphAt(baked, 1)]) {
      const outline = apertureOutline(svg);
      expect(outline.length).toBeGreaterThan(0);
      for (const scale of [1, 4, 20]) {
        const reaching = paintList(svg, scale),
          exact = paintList(svg, Infinity);
        const differing = nearOutline(outline, scale, [0.25, 0.5, 0.75, 1, 1.5])
          .filter(({ p }) => colourAt(reaching, p) !== colourAt(exact, p))
          .map(({ p }) => `(${p[0].toFixed(3)}, ${p[1].toFixed(3)}) at ${scale}px: ${colourAt(reaching, p)} for ${colourAt(exact, p)}`);
        expect(differing.slice(0, 5), `${differing.length} points differ`).toEqual([]);
      }
    }
  });

  test("cut nothing at the closed pose, which matches the closed static image", () => {
    const closed = paintList(renderMorphAt(artifact, 0.333), 4);
    const still = paintList(filterSVGAttributes(SVG, { eyes: "closed" }), 4);
    const differing: string[] = [];
    for (let x = 0; x <= 140; x += 0.25) {
      for (let y = 30; y <= 70; y += 0.25) {
        const a = colourAt(closed, [x, y]),
          b = colourAt(still, [x, y]);
        if (a !== b) differing.push(`(${x}, ${y}) closed ${a} static ${b}`);
      }
    }
    expect(differing.slice(0, 5), `${differing.length} points differ`).toEqual([]);
  });
});

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
    const areas: number[][] = [];
    artifact.apertures.forEach((samples, a) => {
      areas.push([]);
      samples.forEach((loops, s) => {
        let area = 0;
        loops.forEach((flat, l) => {
          const pts: Point[] = [];
          for (let k = 0; k + 1 < flat.length; k += 2) pts.push([flat[k]!, flat[k + 1]!]);
          if (properlyCrosses(pts)) crossed.push(`aperture ${a} sample ${s} loop ${l}`);
          for (let k = 0; k < pts.length; k++) {
            const [x1, y1] = pts[k]!,
              [x2, y2] = pts[(k + 1) % pts.length]!;
            area += (x1 * y2 - x2 * y1) / 2;
          }
        });
        areas[a]!.push(Math.abs(area));
      });
    });
    expect(crossed).toEqual([]);
    // The opening is really there between the poses, not collapsed to a
    // simple but empty loop: every sample but the closed end has area.
    for (const table of areas) {
      const [open, shut] = table[0]! > table[table.length - 1]! ? [table[0]!, table[table.length - 1]!] : [table[table.length - 1]!, table[0]!];
      expect(open).toBeGreaterThan(500);
      expect(shut).toBeLessThan(1);
      expect(table.filter((a) => a > 1).length, JSON.stringify(table)).toBe(table.length - 1);
    }
  });
});
