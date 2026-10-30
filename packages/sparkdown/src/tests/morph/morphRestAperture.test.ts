import { flattenCubic } from "@impower/spark-morph/src/geometry/cubic";
import { parsePathData } from "@impower/spark-morph/src/index";
import { describe, expect, test } from "vitest";
import { filterSVGAttributes } from "../../attributes";
import { applyPoint, invert, multiply, parseTransform, IDENTITY, type Affine } from "../../morph/affine";
import { bakeMorphArtifact } from "../../morph/bake";
import { renderMorphAt } from "../../morph/render";
import { parse } from "../../txml/txml";
import { blink, portrait } from "./fixtures";

const UPPER = "M20,50 C40,15 95,0 120,45 C110,40 100,24 85,26 C70,28 60,36 45,34 C35,33 28,44 20,50Z";
const LOWER = "M20,50 C30,52 45,60 60,58 C80,56 100,62 120,45 C95,72 50,75 20,50Z";
const CLOSED = "M20,50 C50,46 90,42 120,45 C90,48 50,52 20,50Z";
const WHITE = "M20,50 C40,15 95,0 120,45 C95,72 50,75 20,50Z";
const PUPIL = "M62,45 C62,33 82,33 82,45 C82,57 62,57 62,45Z";

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

const winding = (shape: Point[][], [x, y]: Point): number => {
  let total = 0;
  for (const ring of shape) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!,
        [xj, yj] = ring[j]!;
      if (yj <= y !== yi <= y && x < ((xi - xj) * (y - yj)) / (yi - yj) + xj) total += yi > yj ? 1 : -1;
    }
  }
  return total;
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

interface Painted {
  fill: string;
  shape: Point[][];
  clips: ((p: Point) => number)[];
}

const elementChildren = (node: Element) => node.children.filter((c): c is Element => !!c && typeof c === "object");

const hidden = (node: Element) => node.attributes["display"] === "none" || /display:\s*none/.test(node.attributes["style"] ?? "");

const transformOf = (node: Element): Affine => parseTransform(node.attributes["transform"])!;

const mapRings = (m: Affine, shape: Point[][]): Point[][] => shape.map((ring) => ring.map((point) => applyPoint(m, point)));

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
  const property = (node: Element | undefined, name: string): string | undefined => {
    for (let at = node; at; at = parentOf.get(at)) {
      const inline = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(at.attributes["style"] ?? "")?.[1];
      const value = inline ?? at.attributes[name];
      if (value !== undefined) return value.trim();
    }
    return undefined;
  };
  const reveals = (resource: Element, space: Affine): ((p: Point) => number) => {
    const local = invert(space)!;
    if (resource.tagName === "clipPath") {
      const shapes = elementChildren(resource).map((child) => mapRings(transformOf(child), rings(child.attributes["d"] ?? "")));
      return (p) => (shapes.some((shape) => inside(shape, applyPoint(local, p))) ? 1 : 0);
    }
    const covers = elementChildren(resource)
      .filter((c) => c.tagName === "path")
      .map((path) => {
        const fill = path.attributes["d"] ? mapRings(transformOf(path), rings(path.attributes["d"])) : [];
        const paint = (name: string) => {
          const colour = property(path, name);
          return colour === undefined || colour === "none" ? 0 : Number(property(path, `${name}-opacity`) ?? 1);
        };
        const fillAlpha = paint("fill"),
          strokeAlpha = paint("stroke");
        const width = Number(/^([\d.]+)/.exec(property(path, "stroke-width") ?? "1")?.[1]);
        const reach = (property(path, "vector-effect") === "non-scaling-stroke" ? width / scale : width) / 2;
        const bound = /url\(#([^)]+)\)/.exec(property(path, "clip-path") ?? "")?.[1];
        const bounds = bound
          ? elementChildren(byId.get(bound)!)
              .filter((c) => c.tagName === "path")
              .map((c) => ({ shape: rings(c.attributes["d"] ?? ""), evenodd: property(c, "clip-rule") === "evenodd" }))
          : undefined;
        const kept = (q: Point) => !bounds || bounds.some(({ shape, evenodd }) => (evenodd ? inside(shape, q) : winding(shape, q) !== 0));
        return (q: Point) => (!kept(q) ? 0 : inside(fill, q) ? fillAlpha : strokeAlpha > 0 && distance(fill, q) <= reach ? strokeAlpha : 0);
      });
    return (p) => {
      const q = applyPoint(local, p);
      return Math.max(0, ...covers.map((cover) => cover(q)));
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
    expect(rest.some((item) => item.clips.length > 0)).toBe(true);
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
      expect(changes).toBeGreaterThan(0);
    }
  });

  const evenOdd = (svg: string) => svg.replace('height="100">', 'height="100" style="fill-rule:evenodd;clip-rule:evenodd">');
  const closedBeneath = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100" width="140" height="100">
<path data-name="face" d="M0,0H140V100H0Z" fill="#c96"/>
<g data-name="eyes.closed"><path data-name="eyelash-left" d="${CLOSED}" fill="#111"/></g>
<path data-name="eyeball-white-left" d="${WHITE}" fill="#fff"/>
<path data-name="pupil-left" d="${PUPIL}" fill="#234"/>
<g data-name="eyes.open:default">
<path data-name="eyelash-left" d="${UPPER}" fill="#111"/>
<path data-name="eyelash-left" d="${LOWER}" fill="#111"/>
</g>
</svg>`;
  const closedApart = closedBeneath.replace(
    `<path data-name="eyelash-left" d="${CLOSED}" fill="#111"/>`,
    `<path data-name="eyelash-left" d="M20,50 C50,38 90,34 120,45 C90,40 50,44 20,50Z" fill="#111"/><path data-name="eyelash-left" d="M20,50 C50,49 90,48 120,45 C90,52 50,56 20,50Z" fill="#111"/>`,
  );
  const MOVING: [string, string][] = [
    ["lashes that meet at both corners", SVG],
    ["open lashes whose inner corner tips do not meet", eye(WHITE_SHORT, LOWER_SHORT)],
    ["art whose root clips even-odd", evenOdd(SVG)],
    ["a closed lash painted beneath the whites", closedBeneath],
  ];
  const OFFSETS: [string, number][] = [
    ["closing", 0.1],
    ["halfway closed", 0.2],
    ["nearly closed", 0.28],
    ["reopening", 0.5],
  ];
  const MID_BLINK = MOVING.flatMap(([name, source]) => OFFSETS.map(([when, offset]) => [`${name}, ${when}`, source, offset] as const));

  test.each(MID_BLINK)("reach half a screen pixel past the aperture's outline under the moving edges: %s", (_name, source, offset) => {
    const baked = bakeMorphArtifact({ source, selection: {}, recipe: blink(), key: "k", variant: "bunny" });
    expect(baked.status).toBe("live");
    const svg = renderMorphAt(baked, offset);
    for (const scale of [4, 20]) {
      const frame = paintList(svg, scale);
      const lashes = frame.filter((item) => item.fill === "#111");
      const white = frame.find((item) => item.fill === "#fff")!;
      const outline = apertureOutline(svg);
      expect(outline.length).toBeGreaterThan(0);
      const underLash = nearOutline(outline, scale, [0.5]).filter(({ p, outside }) => outside && lashes.some((lash) => inside(lash.shape, p)));
      expect(underLash.length).toBeGreaterThan(100);
      const cut = underLash.filter(({ p }) => white.clips.some((clip) => clip(p) < 1));
      expect(cut.slice(0, 5).map(({ p }) => p), `${cut.length} of ${underLash.length} points under the lashes cut at ${scale}px`).toEqual([]);
    }
  });

  const CLOSED_POSES = [...MOVING, ["two closed lashes apart, painted beneath the whites", closedApart] as const].map(([name, source]) => [`${name}, closed`, source, 0.333] as const);

  const atClosedDepth = blink({ layers: { "eyelash-left": { depth: "eyes.closed" } } });
  const restingClosed = blink({
    keyframes: [
      { offset: 0, eyes: { state: "closed" } },
      { offset: 0.5, eyes: { state: "open" } },
      { offset: 1, eyes: { state: "closed" } },
    ],
  });
  const closedFirst = closedBeneath.replace('data-name="eyes.closed"', 'data-name="eyes.closed:default"').replace('data-name="eyes.open:default"', 'data-name="eyes.open"');
  const BENEATH = [
    ...OFFSETS.map(([when, offset]) => [`moving lashes at the closed pose's depth, beneath the whites, ${when}`, closedBeneath, offset, atClosedDepth] as const),
    ...[0.1, 0.25, 0.4].map((offset) => [`a variant resting closed, its lashes beneath the whites, at ${offset}`, closedFirst, offset, restingClosed] as const),
  ];

  test.each([0.1, 0.2, 0.28, 0.5])("leave no gap between the aperture and the moving lashes it is clipped to, at %s", (offset) => {
    const svg = renderMorphAt(artifact, offset);
    const outline = apertureOutline(svg);
    expect(outline.length).toBeGreaterThan(0);
    for (const scale of [4, 20]) {
      const frame = paintList(svg, scale);
      const lashes = frame.filter((item) => item.fill === "#111");
      const white = frame.find((item) => item.fill === "#fff")!;
      const beside = nearOutline(outline, scale, [0.5]).filter(({ p, outside }) => outside && p[0] > 25 && p[0] < 115 && inside(white.shape, p));
      expect(beside.length).toBeGreaterThan(200);
      const gaps = beside
        .filter(({ p }) => !lashes.some((lash) => inside(lash.shape, p)))
        .map(({ p }) => Math.min(...lashes.map((lash) => distance(lash.shape, p))));
      expect(Math.max(0, ...gaps), `${gaps.length} of ${beside.length} points beside the outline under no lash at ${scale}px`).toBeLessThan(0.3 / scale);
    }
  });

  test("give the reach clip path an id no authored resource has", () => {
    const authored = SVG.replace(
      '<path data-name="face"',
      '<defs><clipPath id="morph-clip-0-0-reach"><path d="M60,0H80V100H60Z"/></clipPath></defs><path data-name="face"',
    ).replace(`<path data-name="eyeball-white-left" d="${WHITE}" fill="#fff"/>`, `<path data-name="eyeball-white-left" d="${WHITE}" fill="#fff" clip-path="url(#morph-clip-0-0-reach)"/>`);
    const baked = bakeMorphArtifact({ source: authored, selection: {}, recipe: blink(), key: "k", variant: "bunny" });
    expect(baked.status).toBe("live");
    const svg = renderMorphAt(baked, 0.2);
    expect(svg).toContain("-reach");
    const ids = [...svg.matchAll(/\sid='([^']*)'/g)].map((m) => m[1]!);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    const ref = /data-name='eyeball-white-left'[^>]*clip-path='url\(#([^)]+)\)'|clip-path='url\(#([^)]+)\)'[^>]*data-name='eyeball-white-left'/.exec(svg);
    const target = ref?.[1] ?? ref?.[2];
    expect(target).toBeDefined();
    expect(svg).toContain(`<clipPath id='${target}'><path d='M60,0H80V100H60Z'/></clipPath>`);
  });

  test.each([0.1, 0.2, 0.28])("reach under each eye's own lashes when one clip entry holds both eyes, at %s", (offset) => {
    const recipe = blink({
      clips: [{ between: ["eyelash-left", "eyelash-right"], targets: ["eyeball-white-left", "pupil-left", "eyeball-white-right", "pupil-right"] }],
    });
    const baked = bakeMorphArtifact({ source: portrait({ right: true }), selection: {}, recipe, key: "k", variant: "bunny" });
    expect(baked.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(baked.status).toBe("live");
    const svg = renderMorphAt(baked, offset);
    const outline = apertureOutline(svg);
    expect(outline.length).toBe(2);
    for (const scale of [4, 20]) {
      const frame = paintList(svg, scale);
      const lashes = frame.filter((item) => item.fill === "#111");
      const underLash = nearOutline(outline, scale, [0.5]).filter(({ p, outside }) => outside && lashes.some((lash) => inside(lash.shape, p)));
      for (const [side, shift] of [["left", 0], ["right", 120]] as const) {
        const white = frame.find((item) => item.fill === "#fff" && item.shape[0]!.some(([x]) => x > 15 + shift && x < 125 + shift))!;
        const here = underLash.filter(({ p }) => p[0] > 15 + shift && p[0] < 125 + shift && inside(white.shape, p));
        expect(here.length, side).toBeGreaterThan(50);
        const cut = here.filter(({ p }) => white.clips.some((clip) => clip(p) < 1));
        expect(cut.slice(0, 5).map(({ p }) => p), `${cut.length} of ${here.length} points under the ${side} lashes cut at ${scale}px`).toEqual([]);
      }
    }
  });

  test.each(BENEATH)("reach no target painted above the moving edges: %s", (_name, source, offset, recipe) => {
    const baked = bakeMorphArtifact({ source, selection: {}, recipe, key: "k", variant: "bunny" });
    expect(baked.status).toBe("live");
    const svg = renderMorphAt(baked, offset);
    expect(svg).not.toContain("-reach");
    expect(apertureOutline(svg).length).toBeGreaterThan(0);
  });

  test.each([...MID_BLINK.map((row) => [...row, blink()] as const), ...CLOSED_POSES.map((row) => [...row, blink()] as const), ...BENEATH])(
    "reach nowhere it would show away from rest: %s",
    (_name, source, offset, recipe) => {
      const baked = bakeMorphArtifact({ source, selection: {}, recipe, key: "k", variant: "bunny" });
      const svg = renderMorphAt(baked, offset);
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
    },
  );

  const masksOf = (svg: string) => {
    const doc = parse(svg);
    const all: Element[] = [];
    const collect = (node: Element) => {
      all.push(node);
      elementChildren(node).forEach(collect);
    };
    ((Array.isArray(doc) ? doc : [doc]) as Element[]).forEach(collect);
    return all
      .filter((node) => (node.tagName === "mask" || node.tagName === "clipPath") && /morph-clip-/.test(node.attributes["id"] ?? ""))
      .map((aperture) => ({
        kind: aperture.tagName,
        path: elementChildren(aperture).find((c) => c.tagName === "path")!.attributes,
        wrapper: all.find((node) => (node.attributes["mask"] ?? node.attributes["clip-path"]) === `url(#${aperture.attributes["id"]})`),
      }));
  };

  test.each([
    ["a nearly singular parent", [1, 1, 1, 1.000001, 0, 0]],
    ["a parent translated a hundred million units", [1, 1, 0, 1, 100000003, 100000004]],
    ["a parent translated ten million units", [1, 0.1, 0.2, 1, 10000000.3, 10000000.4]],
  ] as [string, Affine][])("clip a target under %s in its own space, with no reach", (_name, parent) => {
    const source = underParent(`matrix(${parent.join(" ")})`, `matrix(${invert(parent)!.join(" ")})`);
    const baked = bakeMorphArtifact({ source, selection: {}, recipe: blink(), key: "k", variant: "bunny" });
    expect(baked.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(baked.status).toBe("live");
    for (const svg of [baked.rest, renderMorphAt(baked, 0)]) {
      const masks = masksOf(svg);
      const white = masks.filter(({ wrapper }) => (wrapper?.children[0] as Element | undefined)?.attributes["data-name"] === "eyeball-white-left");
      expect(white).toHaveLength(1);
      expect(white[0]!.kind).toBe("clipPath");
      expect(white[0]!.wrapper!.attributes["transform"]).toBeUndefined();
      expect(white[0]!.path["transform"]).toBeDefined();
      expect(masks.filter((m) => m !== white[0]).every(({ kind, path }) => kind === "mask" && /stroke-width:2px/.test(path["style"] ?? ""))).toBe(true);
    }
  });

  test("mask a target under a parent translated ten thousand units in root space, with its reach", () => {
    const parent: Affine = [1, 0.1, 0.2, 1, 10000, 10000];
    const source = underParent(`matrix(${parent.join(" ")})`, `matrix(${invert(parent)!.join(" ")})`);
    const baked = bakeMorphArtifact({ source, selection: {}, recipe: blink(), key: "k", variant: "bunny" });
    expect(baked.status).toBe("live");
    const white = masksOf(baked.rest).find(({ wrapper }) => ((wrapper?.children[0] as Element)?.children[0] as Element | undefined)?.attributes["data-name"] === "eyeball-white-left")!;
    expect(white.kind).toBe("mask");
    expect(white.wrapper!.attributes["transform"]).toBeDefined();
    expect(white.path["style"]).toMatch(/stroke-width:2px/);
  });

  test("reach past an open eye's outline and not a closed one's in the same clip entry", () => {
    const right = (d: string) => d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (_m, x: string, y: string) => `${Number(x) + 140},${y}`);
    const wink = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 100" width="280" height="100">
<path data-name="face" d="M0,0H280V100H0Z" fill="#c96"/>
<g data-name="eyes.open:default">
<path data-name="eyeball-white-left" d="${WHITE}" fill="#fff"/>
<path data-name="eyelash-left" d="${UPPER}" fill="#111"/>
<path data-name="eyelash-left" d="${LOWER}" fill="#111"/>
<path data-name="eyelash-right" d="${right(CLOSED)}" fill="#111"/>
</g>
<g data-name="eyes.closed">
<path data-name="eyelash-left" d="${CLOSED}" fill="#111"/>
<path data-name="eyelash-right" d="${right(UPPER)}" fill="#111"/>
<path data-name="eyelash-right" d="${right(LOWER)}" fill="#111"/>
</g>
<path data-name="eyeball-white-right" d="${right(WHITE)}" fill="#fff"/>
</svg>`;
    const recipe = blink({ clips: [{ between: ["eyelash-left", "eyelash-right"], targets: ["eyeball-white-left", "eyeball-white-right"] }] });
    const baked = bakeMorphArtifact({ source: wink, selection: {}, recipe, key: "k", variant: "bunny" });
    expect(baked.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(baked.status).toBe("live");
    for (const svg of [baked.rest, renderMorphAt(baked, 0)]) {
      const outline = apertureOutline(svg);
      expect(outline.length).toBe(2);
      for (const scale of [1, 4, 20]) {
        const reaching = paintList(svg, scale),
          exact = paintList(svg, Infinity);
        const points = nearOutline(outline, scale, [0.25, 0.5, 0.75, 1, 1.5]);
        const closed = points
          .filter(({ p }) => p[0] > 140 && colourAt(reaching, p) !== colourAt(exact, p))
          .map(({ p }) => `(${p[0].toFixed(3)}, ${p[1].toFixed(3)}) at ${scale}px: ${colourAt(reaching, p)} for ${colourAt(exact, p)}`);
        expect(closed.slice(0, 5), `${closed.length} points differ`).toEqual([]);
        if (scale > 1) expect(points.some(({ p }) => p[0] < 140 && colourAt(reaching, p) !== colourAt(exact, p))).toBe(true);
      }
    }
  });

  test("keep the reach for an open eye drawn in tiny root units", () => {
    const tiny = SVG.replace('viewBox="0 0 140 100" width="140" height="100">', 'viewBox="0 0 0.007 0.005" width="140" height="100"><g transform="scale(0.00005)">').replace("</svg>", "</g></svg>");
    const baked = bakeMorphArtifact({ source: tiny, selection: {}, recipe: blink(), key: "k", variant: "bunny" });
    expect(baked.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(baked.status).toBe("live");
    const masks = masksOf(baked.rest);
    expect(masks.length).toBeGreaterThan(0);
    for (const { path } of masks) expect(path["style"]).toMatch(/stroke-width:2px/);
  });

  test("reach nowhere past a rest outline that encloses no area", () => {
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

  const spreadClip = (spread?: number) => blink({ clips: [{ between: ["eyelash-left"], targets: ["eyeball-white-left", "pupil-left"], ...(spread === undefined ? {} : { spread: `${spread}px` }) }] });
  const restStyles = (spread?: number) => {
    const baked = bakeMorphArtifact({ source: SVG, selection: {}, recipe: spreadClip(spread), key: "k", variant: "bunny" });
    expect(baked.status).toBe("live");
    return { baked, styles: masksOf(baked.rest).map(({ path }) => path["style"]) };
  };

  test("write the default spread's rest mask exactly as a one-pixel reach", () => {
    const { baked, styles } = restStyles();
    expect(styles.length).toBeGreaterThan(0);
    for (const style of styles) {
      expect(style).toBe(
        "fill:#fff;fill-opacity:1;fill-rule:nonzero;stroke:#fff;stroke-opacity:1;stroke-width:2px;stroke-dasharray:none;stroke-linejoin:round;visibility:visible;vector-effect:non-scaling-stroke",
      );
    }
    expect(baked.clipTargets.every((target) => target.spread === undefined)).toBe(true);
  });

  test.each([
    [3, /stroke:#fff;stroke-opacity:1;stroke-width:6px;/],
    [0, /stroke:none;/],
    [-1, /stroke:#000;stroke-opacity:1;stroke-width:2px;/],
  ] as const)("stroke the rest mask by spread %s", (spread, pattern) => {
    const { baked, styles } = restStyles(spread);
    expect(styles.length).toBeGreaterThan(0);
    for (const style of styles) expect(style).toMatch(pattern);
    expect(baked.clipTargets.every((target) => target.spread === spread)).toBe(true);
  });

  test.each([
    [3, "stroke:#fff;stroke-opacity:1;stroke-width:6px;"],
    [1, "stroke:#fff;stroke-opacity:1;stroke-width:2px;"],
    [-1, "stroke:#000;stroke-opacity:1;stroke-width:2px;"],
    [0, undefined],
  ] as const)("leave a loop resting closed unstroked at spread %s", (spread, stroke) => {
    const right = (d: string) => d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (_m, x: string, y: string) => `${Number(x) + 140},${y}`);
    const wink = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 100" width="280" height="100">
<path data-name="face" d="M0,0H280V100H0Z" fill="#c96"/>
<g data-name="eyes.open:default">
<path data-name="eyeball-white-left" d="${WHITE}" fill="#fff"/>
<path data-name="eyelash-left" d="${UPPER}" fill="#111"/>
<path data-name="eyelash-left" d="${LOWER}" fill="#111"/>
<path data-name="eyelash-right" d="${right(CLOSED)}" fill="#111"/>
</g>
<g data-name="eyes.closed">
<path data-name="eyelash-left" d="${CLOSED}" fill="#111"/>
<path data-name="eyelash-right" d="${right(UPPER)}" fill="#111"/>
<path data-name="eyelash-right" d="${right(LOWER)}" fill="#111"/>
</g>
<path data-name="eyeball-white-right" d="${right(WHITE)}" fill="#fff"/>
</svg>`;
    const recipe = blink({ clips: [{ between: ["eyelash-left", "eyelash-right"], targets: ["eyeball-white-left", "eyeball-white-right"], spread: `${spread}px` }] });
    const baked = bakeMorphArtifact({ source: wink, selection: {}, recipe, key: "k", variant: "bunny" });
    expect(baked.status).toBe("live");
    const doc = parse(baked.rest);
    const masks: Element[] = [];
    const collect = (node: Element) => {
      if (node.tagName === "mask" && /morph-clip-/.test(node.attributes["id"] ?? "")) masks.push(node);
      elementChildren(node).forEach(collect);
    };
    ((Array.isArray(doc) ? doc : [doc]) as Element[]).forEach(collect);
    expect(masks.length).toBeGreaterThan(0);
    for (const mask of masks) {
      const paths = elementChildren(mask).filter((c) => c.tagName === "path");
      expect(paths[0]!.attributes["style"]).toMatch(/stroke:none;/);
      expect(rings(paths[0]!.attributes["d"]!)).toHaveLength(2);
      if (stroke === undefined) {
        expect(paths).toHaveLength(1);
      } else {
        expect(paths).toHaveLength(2);
        expect(paths[1]!.attributes["style"]).toContain(stroke);
        expect(rings(paths[1]!.attributes["d"]!)).toHaveLength(1);
      }
    }
  });

  test("warn once that a clip-path aperture ignores the spread its entry sets", () => {
    const parent: Affine = [1, 1, 1, 1.000001, 0, 0];
    const source = underParent(`matrix(${parent.join(" ")})`, `matrix(${invert(parent)!.join(" ")})`);
    const bake = (spread?: number) => bakeMorphArtifact({ source, selection: {}, recipe: spreadClip(spread), key: "k", variant: "bunny" });
    expect(bake().diagnostics.filter((d) => d.code === "spread-ignored")).toEqual([]);
    const ignored = bake(2).diagnostics.filter((d) => d.code === "spread-ignored");
    expect(ignored).toHaveLength(1);
    expect(ignored[0]!.severity).toBe("warning");
    expect(ignored[0]!.message).toMatch(/Clip 1/);
  });
});

describe("a live morph's baked apertures", () => {
  test("never cross themselves where open lashes whose tips do not meet pass each other", () => {
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
    for (const table of areas) {
      const [open, shut] = table[0]! > table[table.length - 1]! ? [table[0]!, table[table.length - 1]!] : [table[table.length - 1]!, table[0]!];
      expect(open).toBeGreaterThan(500);
      expect(shut).toBeLessThan(1);
      expect(table.filter((a) => a > 1).length, JSON.stringify(table)).toBe(table.length - 1);
    }
  });
});
