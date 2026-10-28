import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { renderMorphAt } from "../../morph/render";
import type { MorphArtifact, MorphTransition } from "../../morph/types";
import { parse } from "../../txml/txml";
import { paintBlink, paintedPortrait } from "./fixtures";

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

const shown = (svg: string, name: string) =>
  elements(svg).filter((e) => e.attributes["data-name"] === name && e.attributes["data-morph"] && !/display:none/.test(e.attributes["style"] ?? ""));

/** One inline style declaration of the single drawing of `name` shown at `offset`, as written. */
const declared = (artifact: MorphArtifact, offset: number, name: string, property: string): string | undefined => {
  const drawn = shown(renderMorphAt(artifact, offset), name);
  expect(drawn, `${name} at ${offset}`).toHaveLength(1);
  const style = drawn[0]!.attributes["style"] ?? "";
  return style
    .split(";")
    .map((d) => d.split(":"))
    .findLast(([n]) => n!.trim() === property)?.[1]
    ?.trim();
};

const bake = (recipe = paintBlink()) =>
  bakeMorphArtifact({ source: paintedPortrait(), selection: {}, recipe, key: "painted", variant: "painted" });

const morphs = (artifact: MorphArtifact) =>
  artifact.segments.flatMap((s) => s.transitions).filter((t): t is Extract<MorphTransition, { kind: "morph" }> => t.kind === "morph");

/** The paint recorded on the closing segment's track of the drawing `name` leaves from. */
const recorded = (artifact: MorphArtifact, name: string) => {
  const from = shown(renderMorphAt(artifact, 0), name)[0]!.attributes["data-morph"];
  return artifact.segments[0]!.transitions.find((t) => t.kind === "morph" && t.from === from) as Extract<MorphTransition, { kind: "morph" }>;
};

describe("a morphing shape's paint follows it between its two drawings", () => {
  const artifact = bake();

  test("the portrait bakes live", () => {
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toEqual([]);
    expect(morphs(artifact).length).toBeGreaterThan(0);
  });

  test("different fills draw their sRGB blend partway and the authored drawings at both ends", () => {
    // Halfway through the closing segment, black to white.
    expect(declared(artifact, 0.25, "lash", "fill")).toBe("rgba(128,128,128,1)");
    expect(declared(artifact, 0.125, "lash", "fill")).toBe("rgba(64,64,64,1)");
    // At each keyframe the drawing shows as authored, with no paint written.
    for (const [offset, fill] of [[0, "#000"], [0.5, "#fff"], [1, "#000"]] as const) {
      const drawn = shown(renderMorphAt(artifact, offset), "lash");
      expect(drawn).toHaveLength(1);
      expect(drawn[0]!.attributes["fill"]).toBe(fill);
      expect(drawn[0]!.attributes["style"] ?? "").not.toMatch(/fill/);
    }
    // The reopening segment blends back.
    expect(declared(artifact, 0.75, "lash", "fill")).toBe("rgba(128,128,128,1)");
  });

  test("a pair with the same paint records nothing", () => {
    expect(recorded(artifact, "brow").paint).toBeUndefined();
    expect(declared(artifact, 0.25, "brow", "fill")).toBeUndefined();
  });

  test("a stroke present at one end only fades in as its colour at growing alpha", () => {
    expect(recorded(artifact, "crease").paint).toEqual({ stroke: [[255, 0, 0, 0], [255, 0, 0, 1]] });
    expect(declared(artifact, 0.25, "crease", "stroke")).toBe("rgba(255,0,0,0.5)");
    expect(declared(artifact, 0.25, "crease", "fill")).toBeUndefined();
  });

  test("a fill inherited from an ancestor group and a `currentColor` fill are resolved", () => {
    expect(recorded(artifact, "cheek").paint).toEqual({ fill: [[0, 0, 255, 1], [255, 0, 0, 1]] });
    expect(declared(artifact, 0.25, "cheek", "fill")).toBe("rgba(128,0,128,1)");
  });

  test("paint decided by a declaration outside the grammar stays unblended and draws as authored", () => {
    // `color: none` under `currentColor` (`freckle`, `spot`, `dot`), an
    // ancestor's `all:initial` (`mark`) and a fill spaced by no-break spaces
    // (`blot`): each pair keeps its own paint between the poses.
    for (const name of ["freckle", "spot", "dot", "mark", "blot"]) {
      expect(recorded(artifact, name).paint, name).toBeUndefined();
      expect(declared(artifact, 0.25, name, "fill"), name).toBeUndefined();
    }
  });

  describe("out-of-grammar inputs leave the pair unblended", () => {
    // One drawing open, a white one closed; the open drawing's paint is
    // declared as each case says, under a green root `color`.
    const pair = (open: string) =>
      bakeMorphArtifact({
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20" width="40" height="20" color="#0f0">
<g data-name="eyes.open:default"><path data-name="lash" d="M0,0H30V10H0Z" ${open}/></g>
<g data-name="eyes.closed"><path data-name="lash" d="M0,5H30V15H0Z" fill="#fff"/></g>
</svg>`,
        selection: {},
        recipe: paintBlink(),
        key: "pair",
      });
    const cases: [string, string][] = [
      ["unset", 'fill="#f00" style="fill:unset"'],
      ["revert", 'fill="#f00" style="fill:revert"'],
      ["revert-layer", 'fill="#f00" style="fill:revert-layer"'],
      ["all", 'fill="#f00" style="all:initial"'],
      ["var()", 'style="fill:var(--x)"'],
      ["a comment", 'style="fill:/*x*/#000"'],
      ["an escape", 'style="fill:r\\65 d"'],
      ["a no-break space", 'fill=" #000"'],
      ["a non-ASCII name", 'fill="röd"'],
      ["color: none", 'color="none" fill="currentColor"'],
    ];
    test.each(cases)("%s", (_, open) => {
      const artifact = pair(open);
      expect(artifact.status).toBe("live");
      expect(recorded(artifact, "lash").paint).toBeUndefined();
      // The moving drawing keeps its markup's own declaration, if any.
      expect(declared(artifact, 0.25, "lash", "fill") ?? "").not.toMatch(/^rgba\(/);
    });
    test("in-grammar controls blend", () => {
      expect(declared(pair('fill="#000"'), 0.25, "lash", "fill")).toBe("rgba(128,128,128,1)");
      expect(declared(pair('style="fill:\n  rgb(0 0 0) !important"'), 0.25, "lash", "fill")).toBe("rgba(128,128,128,1) !important");
      expect(declared(pair('fill="currentColor"'), 0.25, "lash", "fill")).toBe("rgba(128,255,128,1)");
      expect(declared(pair('fill="#f00" style="fill:initial"'), 0.25, "lash", "fill")).toBe("rgba(128,128,128,1)");
    });
  });

  test("an important inline fill is the one blended, and the blend is written important over it", () => {
    expect(recorded(artifact, "lid").paint).toEqual({ fill: [[0, 0, 0, 1], [255, 255, 255, 1]] });
    expect(declared(artifact, 0.25, "lid", "fill")).toBe("rgba(128,128,128,1) !important");
    // At rest the authored declaration stands.
    expect(declared(artifact, 0, "lid", "fill")).toBe("#000 !important");
  });

  test("fill, stroke and own opacities blend linearly where they differ", () => {
    expect(recorded(artifact, "veil").paint).toEqual({ "fill-opacity": [1, 0.5], "stroke-opacity": [1, 0.2], opacity: [1, 0.4] });
    expect(declared(artifact, 0.25, "veil", "fill-opacity")).toBe("0.75");
    expect(declared(artifact, 0.25, "veil", "stroke-opacity")).toBe("0.6");
    expect(declared(artifact, 0.25, "veil", "opacity")).toBe("0.7");
    expect(declared(artifact, 0.25, "veil", "fill")).toBeUndefined();
    for (const offset of [0, 0.5]) expect(shown(renderMorphAt(artifact, offset), "veil")[0]!.attributes["style"] ?? "").not.toMatch(/opacity/);
  });

  test("a gradient end leaves the pair unblended", () => {
    expect(recorded(artifact, "shine").paint).toBeUndefined();
    const drawn = shown(renderMorphAt(artifact, 0.25), "shine");
    expect(drawn[0]!.attributes["fill"]).toMatch(/^url\(/);
    expect(drawn[0]!.attributes["style"] ?? "").not.toMatch(/fill/);
  });

  test("a track drawing on a carrier copied from a third pose's drawing takes the blend, not its source's paint", () => {
    const states = ["open", "half", "closed", "half", "open"];
    const named = bake(paintBlink({ layers: { shadow: { depth: "eyes.closed" }, glint: { depth: "eyes.closed" } } }, states));
    expect(named.status).toBe("live");
    expect(named.diagnostics).toEqual([]);
    // Open to half-closed draws on a copy of the red closed shadow; the shape
    // blends black to blue there.
    const track = named.segments[0]!.transitions.find((t) => t.kind === "morph" && t.paint?.fill?.[1]?.[2] === 255) as Extract<MorphTransition, { kind: "morph" }>;
    expect(track).toBeDefined();
    expect(track.draw).not.toBe(track.from);
    expect(track.draw).not.toBe(track.to);
    expect(declared(named, 0.125, "shadow", "fill")).toBe("rgba(0,0,128,1)");
    // Half-closed to closed draws on the closed drawing itself.
    expect(declared(named, 0.375, "shadow", "fill")).toBe("rgba(128,0,128,1)");
    // Ends that agree still override a carrier copied from a drawing that does not.
    const glint = named.segments[0]!.transitions.find((t) => t.kind === "morph" && t.paint?.fill?.[0]?.join() === "0,0,0,1" && t.paint.fill[1]!.join() === "0,0,0,1") as Extract<MorphTransition, { kind: "morph" }>;
    expect(glint).toBeDefined();
    expect(glint.draw).not.toBe(glint.from);
    expect(declared(named, 0.125, "glint", "fill")).toBe("rgba(0,0,0,1)");
  });

  test("the rest render and the parts as written carry no blended paint", () => {
    expect(artifact.rest).not.toMatch(/rgba\(/);
    for (const part of artifact.parts) expect(part.svg).not.toMatch(/rgba\(/);
  });
});
