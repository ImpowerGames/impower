import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import type { MorphArtifact } from "../../morph/types";
import { parse } from "../../txml/txml";
import { blink, CLOSED, EYEBALL, LOWER_OPEN, portrait, shiftPath, UPPER_OPEN } from "./fixtures";

type Layout = "none" | "one" | "pair" | "pair-and-lone" | "three";

const EYES = { left: { label: "left", x: 20 }, right: { label: "right", x: 140 } } as const;
type Eye = keyof typeof EYES;

const at = (eye: Eye, path: string, dy = 10) => shiftPath(path, EYES[eye].x, dy);
const lash = (eye: Eye, path: string, dy?: number) => `<path data-name="eyelash-${eye}" d="${at(eye, path, dy)}" fill="#111"/>`;
const white = (eye: Eye) => `<path data-name="eyeball-white-${eye}" d="${at(eye, EYEBALL)}" fill="#fff"/>`;

const drawn = (eye: Eye, layout: Layout): string => {
  switch (layout) {
    case "none":
      return white(eye);
    case "one":
      return lash(eye, CLOSED);
    case "pair":
      return white(eye) + lash(eye, UPPER_OPEN) + lash(eye, LOWER_OPEN);
    case "pair-and-lone":
      return white(eye) + lash(eye, UPPER_OPEN) + lash(eye, LOWER_OPEN) + lash(eye, CLOSED, -25);
    case "three":
      return white(eye) + lash(eye, UPPER_OPEN) + lash(eye, LOWER_OPEN) + lash(eye, CLOSED);
  }
};

const OPEN_LAYOUTS: readonly Layout[] = ["pair", "pair-and-lone"];

const SHARED = [{ between: ["eyelash-left", "eyelash-right"], targets: ["eyeball-white-left", "pupil-left", "eyeball-white-right", "pupil-right"] }];

interface Row {
  clips: "per eye" | "shared";
  rest: "asleep" | "open" | "closed";
  left: Layout;
  right: Layout;
  expect: "live" | { code: string };
}

const ROWS: Row[] = [];
for (const clips of ["per eye", "shared"] as const) {
  for (const left of ["none", "one", "pair", "pair-and-lone", "three"] as const) {
    for (const right of ["one", "pair"] as const) {
      ROWS.push({
        clips,
        rest: "asleep",
        left,
        right,
        expect: left === "none" ? { code: "edge-missing" } : left === "three" ? { code: "aperture-ambiguous" } : "live",
      });
    }
  }
  ROWS.push({ clips, rest: "open", left: "pair", right: "pair", expect: "live" });
  ROWS.push({ clips, rest: "closed", left: "one", right: "one", expect: "live" });
}

type Element = { tagName: string; attributes: Record<string, string>; children: unknown[] };

const elements = (svg: string): Element[] => {
  const out: Element[] = [];
  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      out.push(node as Element);
      walk((node as Element).children);
    }
  };
  const doc = parse(svg);
  walk(Array.isArray(doc) ? doc : [doc]);
  return out;
};

const subtree = (root: Element): Element[] => [root, ...root.children.flatMap((child) => (child && typeof child === "object" ? subtree(child as Element) : []))];

const loopsOf = (d: string): number[][] =>
  d
    .split(/(?=M)/)
    .map((part) => part.match(/-?[0-9.]+/g)?.map(Number) ?? [])
    .filter((flat) => flat.length >= 6);

const area = (flat: number[]) => {
  let sum = 0;
  for (let i = 0; i + 3 < flat.length; i += 2) sum += flat[i]! * flat[i + 3]! - flat[i + 2]! * flat[i + 1]!;
  sum += flat[flat.length - 2]! * flat[1]! - flat[0]! * flat[flat.length - 1]!;
  return Math.abs(sum) / 2;
};

const xs = (flat: number[]) => flat.filter((_, i) => i % 2 === 0);
const ys = (flat: number[]) => flat.filter((_, i) => i % 2 === 1);

function restMasks(artifact: MorphArtifact) {
  return elements(artifact.rest)
    .filter((e) => e.tagName === "mask")
    .map((mask) => {
      const region = {
        x: Number(mask.attributes["x"]),
        y: Number(mask.attributes["y"]),
        width: Number(mask.attributes["width"]),
        height: Number(mask.attributes["height"]),
      };
      const loops = subtree(mask)
        .filter((e) => e.tagName === "path")
        .flatMap((path) => loopsOf(path.attributes["d"] ?? ""));
      return { id: mask.attributes["id"]!, region, loops };
    });
}

const openWithin = (loops: number[][], eye: Eye) =>
  loops.filter((loop) => area(loop) > 1000 && Math.min(...xs(loop)) >= EYES[eye].x - 10 && Math.max(...xs(loop)) <= EYES[eye].x + 110);

describe("the rest outline of a rest no keyframe names", () => {
  test.each(ROWS.map((row) => [row.rest === "asleep" ? `${row.clips}, rest outside the keyframes: left ${row.left}, right ${row.right}` : `${row.clips}, rest ${row.rest} reached by a keyframe (control)`, row] as const))("%s", (_name, row) => {
    const source = portrait({ right: true }).replace("</svg>", `<g data-name="eyes.asleep">${drawn("left", row.left)}${drawn("right", row.right)}</g></svg>`);
    const recipe = blink({ rest: { eyes: { state: row.rest } }, ...(row.clips === "shared" ? { clips: SHARED } : {}) }, true);
    const artifact = bakeMorphArtifact({ source, selection: {}, recipes: [recipe], key: `${row.clips}-${row.rest}-${row.left}-${row.right}` });
    if (row.expect !== "live") {
      expect(artifact.status).toBe("static");
      expect(artifact.diagnostics).toEqual([expect.objectContaining({ code: row.expect.code, severity: "error" })]);
      expect(artifact.diagnostics[0]!.message).toContain("rest pose");
      return;
    }
    expect(artifact.diagnostics).toEqual([]);
    expect(artifact.status).toBe("live");
    const masks = restMasks(artifact);
    expect(masks.length).toBeGreaterThan(0);
    for (const { region, loops } of masks) {
      for (const loop of loops) {
        expect(Math.min(...xs(loop))).toBeGreaterThanOrEqual(region.x);
        expect(Math.max(...xs(loop))).toBeLessThanOrEqual(region.x + region.width);
        expect(Math.min(...ys(loop))).toBeGreaterThanOrEqual(region.y);
        expect(Math.max(...ys(loop))).toBeLessThanOrEqual(region.y + region.height);
      }
    }
    const loops = [...new Map(masks.flatMap((mask) => mask.loops).map((loop) => [loop.join(","), loop])).values()];
    for (const eye of ["left", "right"] as const) {
      const layout = eye === "left" ? row.left : row.right;
      expect(openWithin(loops, eye).length, `${eye} eye drawn ${layout}`).toBe(OPEN_LAYOUTS.includes(layout) ? 1 : 0);
    }
  });
});
