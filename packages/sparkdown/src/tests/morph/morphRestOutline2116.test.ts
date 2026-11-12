import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import type { MorphArtifact } from "../../morph/types";
import { parse } from "../../txml/txml";
import { blink, CLOSED, EYEBALL, LOWER_OPEN, portrait, shiftPath, UPPER_OPEN } from "./fixtures";

type Layout = "none" | "one" | "pair" | "pair-and-lone" | "three" | "stroke" | "percent" | "text";

const EYES = { left: { x: 20 }, right: { x: 140 } } as const;
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
    case "percent":
      return `<circle data-name="eyeball-white-${eye}" cx="50%" cy="50%" r="20%" fill="#fff"/>`;
    case "text":
      return `<text data-name="eyeball-white-${eye}" x="${EYES[eye].x + 40}" y="60">o</text>`;
    case "stroke":
      return `<path data-name="sleep-mark-${eye}" d="${at(eye, "M20,20 L40,20 L20,40 L40,40", -20)}" fill="none" stroke="#111"/>`;
  }
};

const OPEN_LAYOUTS: readonly Layout[] = ["pair", "pair-and-lone"];
const TARGET_LAYOUTS: readonly Layout[] = ["none", "pair", "pair-and-lone", "three"];

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
  for (const left of ["none", "one", "pair", "pair-and-lone", "three", "stroke", "percent", "text"] as const) {
    for (const right of ["one", "pair"] as const) {
      ROWS.push({
        clips,
        rest: "asleep",
        left,
        right,
        expect: left === "none" || left === "percent" || left === "text" ? { code: "edge-missing" } : left === "three" ? { code: "aperture-ambiguous" } : "live",
      });
    }
  }
  ROWS.push({ clips, rest: "open", left: "pair", right: "pair", expect: "live" });
  ROWS.push({ clips, rest: "closed", left: "one", right: "one", expect: "live" });
}

type Element = { tagName: string; attributes: Record<string, string>; children: unknown[] };

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

interface Mask {
  region: { x: number; y: number; width: number; height: number };
  loops: number[][];
}

function restTargets(artifact: MorphArtifact, label: (name: string) => boolean) {
  const masks = new Map<string, Mask>();
  const targets: { name: string; mask: string | undefined }[] = [];
  const children = (element: Element) => element.children.filter((c): c is Element => !!c && typeof c === "object");
  const paths = (element: Element): Element[] => [...(element.tagName === "path" ? [element] : []), ...children(element).flatMap(paths)];
  const walk = (nodes: Element[], mask: string | undefined) => {
    for (const node of nodes) {
      if (node.tagName === "mask") {
        const loops = paths(node).flatMap((path) => loopsOf(path.attributes["d"] ?? ""));
        masks.set(node.attributes["id"]!, {
          region: { x: Number(node.attributes["x"]), y: Number(node.attributes["y"]), width: Number(node.attributes["width"]), height: Number(node.attributes["height"]) },
          loops: [...new Map(loops.map((loop) => [loop.join(","), loop])).values()],
        });
        continue;
      }
      const applied = /url\(#([^)]+)\)/.exec(node.attributes["mask"] ?? "")?.[1] ?? mask;
      const name = node.attributes["data-name"];
      if (name && label(name)) targets.push({ name, mask: applied });
      walk(children(node), applied);
    }
  };
  const doc = parse(artifact.rest);
  const nodes: unknown[] = Array.isArray(doc) ? doc : [doc];
  walk(nodes.filter((c): c is Element => !!c && typeof c === "object"), undefined);
  return { masks, targets };
}

const openOver = (loops: number[][], eye: Eye) =>
  loops.filter((loop) => area(loop) > 1000 && Math.min(...xs(loop)) >= EYES[eye].x - 10 && Math.max(...xs(loop)) <= EYES[eye].x + 110);

const expectInside = (mask: Mask) => {
  for (const loop of mask.loops) {
    expect(Math.min(...xs(loop))).toBeGreaterThanOrEqual(mask.region.x);
    expect(Math.max(...xs(loop))).toBeLessThanOrEqual(mask.region.x + mask.region.width);
    expect(Math.min(...ys(loop))).toBeGreaterThanOrEqual(mask.region.y);
    expect(Math.max(...ys(loop))).toBeLessThanOrEqual(mask.region.y + mask.region.height);
  }
};

const rowName = (row: Row) =>
  row.rest === "asleep" ? `${row.clips}, rest outside the keyframes: left ${row.left}, right ${row.right}` : `${row.clips}, rest ${row.rest} reached by a keyframe (control)`;

describe("the rest outline of a rest no keyframe names", () => {
  test.each(ROWS.map((row) => [rowName(row), row] as const))("%s", (_name, row) => {
    const source = portrait({ right: true }).replace("</svg>", `<g data-name="eyes.asleep">${drawn("left", row.left)}${drawn("right", row.right)}</g></svg>`);
    const recipe = blink({ rest: { eyes: { state: row.rest } }, ...(row.clips === "shared" ? { clips: SHARED } : {}) }, true);
    const artifact = bakeMorphArtifact({ source, selection: {}, recipes: [recipe], key: `${row.clips}-${row.rest}-${row.left}-${row.right}` });
    if (row.expect !== "live") {
      expect(artifact.status).toBe("static");
      const errors = artifact.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toEqual([expect.objectContaining({ code: row.expect.code })]);
      expect(errors[0]!.message).toContain("rest pose");
      return;
    }
    expect(artifact.diagnostics).toEqual([]);
    expect(artifact.status).toBe("live");
    const { masks, targets } = restTargets(artifact, (name) => name.startsWith("eyeball-white-"));
    for (const eye of ["left", "right"] as const) {
      const layout = row.rest === "asleep" ? (eye === "left" ? row.left : row.right) : row.rest === "open" ? "pair" : "one";
      const whites = targets.filter((target) => target.name === `eyeball-white-${eye}`);
      if (row.rest === "asleep" && !TARGET_LAYOUTS.includes(layout)) {
        expect(whites, `${eye} eye drawn ${layout} draws no target`).toEqual([]);
        continue;
      }
      if (row.rest === "closed") continue;
      expect(whites.length, `${eye} eye drawn ${layout} draws its white`).toBeGreaterThan(0);
      for (const target of whites) {
        const mask = target.mask === undefined ? undefined : masks.get(target.mask);
        expect(mask, `${eye} white is masked`).toBeDefined();
        expectInside(mask!);
        expect(openOver(mask!.loops, eye).length, `${eye} eye drawn ${layout}: openings over it in its own mask`).toBe(OPEN_LAYOUTS.includes(layout) ? 1 : 0);
      }
    }
  });

  const compound = (lids: string) =>
    portrait({ right: true }).replace(
      "</svg>",
      `<g data-name="eyes.asleep"><path data-name="eyeballs" d="${at("left", EYEBALL)} ${at("right", EYEBALL)}" fill="#fff"/>${lids}</g></svg>`,
    );
  const compoundBake = (lids: string) =>
    bakeMorphArtifact({
      source: compound(lids),
      selection: {},
      recipes: [blink({ rest: { eyes: { state: "asleep" } }, clips: [{ between: ["eyelash-left", "eyelash-right"], targets: ["eyeballs"] }] }, true)],
      key: `compound-${lids.length}`,
    });

  test("one compound target drawing both eyes, with lids around only one, bakes static naming the target", () => {
    const artifact = compoundBake(lash("left", UPPER_OPEN) + lash("left", LOWER_OPEN));
    expect(artifact.status).toBe("static");
    expect(artifact.diagnostics).toEqual([expect.objectContaining({ code: "edge-missing", severity: "error" })]);
    expect(artifact.diagnostics[0]!.message).toContain('"eyeballs"');
  });

  test("one compound target drawing both eyes, with lids around each, plays an opening over each eye in its own mask", () => {
    const artifact = compoundBake(lash("left", UPPER_OPEN) + lash("left", LOWER_OPEN) + lash("right", UPPER_OPEN) + lash("right", LOWER_OPEN));
    expect(artifact.diagnostics).toEqual([]);
    expect(artifact.status).toBe("live");
    const { masks, targets } = restTargets(artifact, (name) => name === "eyeballs");
    expect(targets).toHaveLength(1);
    const mask = masks.get(targets[0]!.mask!)!;
    expectInside(mask);
    expect(openOver(mask.loops, "left")).toHaveLength(1);
    expect(openOver(mask.loops, "right")).toHaveLength(1);
  });
});
