import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { renderMorphAt } from "../../morph/render";
import type { MorphArtifact, MorphTransition } from "../../morph/types";
import { parse } from "../../txml/txml";
import { gradientPortrait, paintBlink } from "./fixtures";

type Element = { tagName: string; attributes: Record<string, string>; children: unknown[] };
const elements = (svg: string): Element[] => {
  const out: Element[] = [];
  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (node && typeof node === "object") {
        out.push(node as Element);
        walk((node as Element).children);
      }
    }
  };
  const doc = parse(svg);
  walk(Array.isArray(doc) ? doc : [doc]);
  return out;
};

type Morph = Extract<MorphTransition, { kind: "morph" }>;

const shown = (svg: string, name: string) =>
  elements(svg).filter((e) => e.attributes["data-name"] === name && e.attributes["data-morph"] && !/display:none/.test(e.attributes["style"] ?? ""));

const bake = (source = gradientPortrait(), recipe = paintBlink()) =>
  bakeMorphArtifact({ source, selection: {}, recipe, key: "gradient", variant: "gradient" });

/** The closing segment's track of the drawing `name` leaves from. */
const track = (artifact: MorphArtifact, name: string): Morph => {
  const from = shown(renderMorphAt(artifact, 0), name)[0]!.attributes["data-morph"];
  return artifact.segments[0]!.transitions.find((t) => t.kind === "morph" && t.from === from) as Morph;
};

/** The single drawing of `name` shown at `offset`. */
const drawn = (artifact: MorphArtifact, offset: number, name: string) => {
  const found = shown(renderMorphAt(artifact, offset), name);
  expect(found, `${name} at ${offset}`).toHaveLength(1);
  return found[0]!;
};

/** A gradient element of the picture at `offset`, its attributes and its stops'. */
const gradient = (artifact: MorphArtifact, offset: number, id: string) => {
  const element = elements(renderMorphAt(artifact, offset)).find((e) => e.attributes["id"] === id);
  expect(element, id).toBeDefined();
  const stops = (element!.children as Element[]).filter((c) => c && typeof c === "object" && c.tagName === "stop").map((s) => s.attributes);
  return { attributes: element!.attributes, stops };
};

const fillOf = (element: Element) => /(?:^|;)fill:([^;]+)/.exec(element.attributes["style"] ?? "")?.[1];

describe("a morphing shape's gradient follows it between its two drawings", () => {
  const artifact = bake();

  test("the portrait bakes live", () => {
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toEqual([]);
  });

  test("a moved radial highlight blends its transform on the shape's own copy, its stops kept", () => {
    const t = track(artifact, "highlight");
    expect(t.gradients?.fill).toBeDefined();
    const id = t.gradients!.fill!.id;
    expect(id.startsWith(artifact.idPrefix)).toBe(true);
    // Halfway through the closing segment the shape paints with its copy.
    expect(fillOf(drawn(artifact, 0.25, "highlight"))).toBe(`url(#${id})`);
    const copy = gradient(artifact, 0.25, id);
    expect(copy.attributes).toMatchObject({
      gradientUnits: "userSpaceOnUse",
      cx: "20",
      cy: "20",
      r: "10",
      fx: "20",
      fy: "20",
      fr: "0",
      gradientTransform: "matrix(1 0 0 1 0 5)",
    });
    expect(copy.stops).toEqual([
      { offset: "0", "stop-color": "rgba(255,255,255,1)" },
      { offset: "1", "stop-color": "rgba(255,255,255,0)" },
    ]);
    // The reopening segment blends back.
    expect(gradient(artifact, 0.75, id).attributes["gradientTransform"]).toBe("matrix(1 0 0 1 0 5)");
  });

  test("a linear pair with different stop colours blends them in sRGB", () => {
    const id = track(artifact, "liner").gradients!.fill!.id;
    expect(fillOf(drawn(artifact, 0.25, "liner"))).toBe(`url(#${id})`);
    expect(gradient(artifact, 0.25, id).stops).toEqual([
      { offset: "0", "stop-color": "rgba(128,128,0,1)" },
      { offset: "1", "stop-color": "rgba(0,0,255,1)" },
    ]);
  });

  test("a user-space gradient is placed in the moving node's space as each drawing shows it", () => {
    // Both drawings name one gradient, but the closed drawing's transform
    // moves it down with the drawing.
    const id = track(artifact, "glow").gradients!.fill!.id;
    expect(gradient(artifact, 0.25, id).attributes).toMatchObject({ x1: "70", y1: "10", x2: "90", y2: "20", gradientTransform: "matrix(1 0 0 1 0 5)" });
  });

  test("a bounding-box gradient keeps its unit coordinates and follows the moving box", () => {
    const t = track(artifact, "sheen");
    const id = t.gradients!.fill!.id;
    const copy = gradient(artifact, 0.25, id);
    expect(copy.attributes).toMatchObject({ gradientUnits: "objectBoundingBox", x1: "0", y1: "0", x2: "0", y2: "1", gradientTransform: "matrix(1 0 0 1 0 0)" });
    expect(copy.stops.map((s) => s["offset"])).toEqual(["0.25", "1"]);
    // The box it fills is the moving shape's, halfway down.
    const leaf = drawn(artifact, 0.25, "sheen");
    expect(fillOf(leaf)).toBe(`url(#${id})`);
    expect(leaf.attributes["d"]).not.toBe(drawn(artifact, 0, "sheen").attributes["d"]);
  });

  test("a stop-count mismatch and a gradient against a solid colour stay unblended", () => {
    for (const name of ["stripe", "patch"]) {
      const t = track(artifact, name);
      expect(t.gradients, name).toBeUndefined();
      expect(t.paint, name).toBeUndefined();
      const leaf = drawn(artifact, 0.25, name);
      expect(fillOf(leaf), name).toBeUndefined();
      expect(leaf.attributes["fill"], name).toMatch(/^url\(/);
    }
  });

  test("one gradient both drawings show alike needs no copy", () => {
    expect(track(artifact, "plain").gradients).toBeUndefined();
    expect(fillOf(drawn(artifact, 0.25, "plain"))).toBeUndefined();
  });

  test("at the poses the authored drawings show with their own gradients, and the copies keep their markup", () => {
    const ids = ["highlight", "liner", "glow", "sheen"].map((name) => track(artifact, name).gradients!.fill!.id);
    const live = artifact.parts.filter((p) => p.kind === "live").map((p) => p.svg).join("");
    const markup = (id: string) => elements(live).find((e) => e.attributes["id"] === id)!.attributes;
    for (const offset of [0, 0.5, 1]) {
      for (const name of ["highlight", "liner", "glow", "sheen"]) {
        const leaf = drawn(artifact, offset, name);
        expect(fillOf(leaf), `${name} at ${offset}`).toBeUndefined();
        expect(leaf.attributes["fill"]).toMatch(new RegExp(`^url\\(#${artifact.idPrefix}(hl|liner|glow|sheen)`));
      }
      for (const id of ids) expect(gradient(artifact, offset, id).attributes).toEqual(markup(id));
    }
    expect(artifact.rest).not.toMatch(/morph-gradient/);
  });

  test("two tracks drawing on carriers of one drawing each get their own copy", () => {
    const two = (a: string) => `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#000"/>`;
    // Two open lashes converge on one closed lash, an ellipse, whose depth
    // they keep: every track of a basic shape draws on a carrier.
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" width="100" height="60">
<defs><linearGradient id="o">${two("#fff")}</linearGradient><linearGradient id="c">${two("#f00")}</linearGradient></defs>
<g data-name="eyes.open:default"><path data-name="lash" d="M10,10H40V15H10Z" fill="url(#o)"/><path data-name="lash" d="M10,30H40V35H10Z" fill="url(#o)"/></g>
<g data-name="eyes.closed"><ellipse data-name="lash" cx="25" cy="22" rx="15" ry="3" fill="url(#c)"/></g>
</svg>`;
    const carried = bake(source, paintBlink({ layers: { lash: { depth: "eyes.closed" } } }));
    expect(carried.status).toBe("live");
    const tracks = carried.segments[0]!.transitions.filter((t): t is Morph => t.kind === "morph");
    expect(tracks).toHaveLength(2);
    const [a, b] = tracks;
    expect(a!.draw).not.toBe(a!.to);
    expect(b!.draw).not.toBe(b!.to);
    expect(a!.draw).not.toBe(b!.draw);
    expect(a!.gradients?.fill?.id).toBeDefined();
    expect(b!.gradients?.fill?.id).toBeDefined();
    expect(a!.gradients!.fill!.id).not.toBe(b!.gradients!.fill!.id);
    // Each carrier paints with its own copy; the closed drawing keeps its gradient.
    const frame = elements(renderMorphAt(carried, 0.25));
    const fills = frame.filter((e) => e.attributes["data-morph"] === a!.draw || e.attributes["data-morph"] === b!.draw).map(fillOf);
    expect(fills.sort()).toEqual([`url(#${a!.gradients!.fill!.id})`, `url(#${b!.gradients!.fill!.id})`].sort());
    expect(frame.find((e) => e.tagName === "ellipse")!.attributes["fill"]).toBe(`url(#${carried.idPrefix}c)`);
  });

  describe("paint outside the grammar leaves the pair unblended", () => {
    const pair = (open: string, defs = "") =>
      bake(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20" width="40" height="20">
<defs>${defs}<linearGradient id="a"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#000"/></linearGradient><linearGradient id="b"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><pattern id="p" width="1" height="1"><rect width="1" height="1"/></pattern></defs>
<g data-name="eyes.open:default"><path data-name="lash" d="M0,0H30V10H0Z" ${open}/></g>
<g data-name="eyes.closed"><path data-name="lash" d="M0,5H30V15H0Z" fill="url(#b)"/></g>
</svg>`,
      );
    const cases: [string, string, string?][] = [
      ["a fallback colour", 'fill="url(#a) red"'],
      ["a pattern", 'fill="url(#p)"'],
      ["a quoted reference", "style=\"fill:url('#a')\""],
      ["a missing gradient", 'fill="url(#missing)"'],
      ["a gradient outside the grammar", 'fill="url(#c)"', '<linearGradient id="c" style="color:red"><stop offset="0"/><stop offset="1"/></linearGradient>'],
    ];
    test.each(cases)("%s", (_, open, defs) => {
      const artifact = pair(open, defs);
      expect(artifact.status).toBe("live");
      expect(track(artifact, "lash").gradients).toBeUndefined();
      expect(fillOf(drawn(artifact, 0.25, "lash")) ?? "").not.toMatch(/morph-gradient/);
    });
    test("in-grammar controls blend", () => {
      for (const open of ['fill="url(#a)"', 'fill="URL(#a)"', 'style="fill: url(#a) !important"', 'fill=" url(#a) "']) {
        expect(track(pair(open), "lash").gradients?.fill, open).toBeDefined();
      }
    });
  });
});
