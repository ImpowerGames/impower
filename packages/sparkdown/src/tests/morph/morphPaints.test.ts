import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { parseMorphEasing } from "../../morph/easing";
import { renderMorphAt } from "../../morph/render";
import type { MorphArtifact } from "../../morph/types";
import { parse } from "../../txml/txml";
import { MASKED_VARIANTS, maskedBlink, maskedPortrait } from "./fixtures";

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

const fills = (artifact: MorphArtifact, offset: number, name = "eyelash-left"): string[] =>
  elements(renderMorphAt(artifact, offset))
    .filter((e) => e.attributes["data-name"] === name && e.attributes["data-morph"] && !/display:none/.test(e.attributes["style"] ?? ""))
    .map((e) => {
      const inline = (e.attributes["style"] ?? "")
        .split(";")
        .map((d) => d.split(":"))
        .findLast(([n]) => n!.trim() === "fill")?.[1]
        ?.trim();
      return inline ?? e.attributes["fill"] ?? "";
    });

const ENTRY = { targets: ["eyelash-left"], state: "eyes.closed", when: "mask.on", fill: "#c9c9c9", span: "40%" };
const GREY = "rgba(201,201,201,1)";

type Variant = keyof typeof MASKED_VARIANTS;
const bake = (variant: Variant, paints: Record<string, unknown>[] = [ENTRY]) =>
  bakeMorphArtifact({
    source: maskedPortrait(),
    selection: { ...MASKED_VARIANTS[variant] },
    recipe: maskedBlink(paints),
    key: `masked-${variant}`,
    variant,
    uri: "file:///masked.svg",
  });

const steps = parseMorphEasing("steps(3)")!;
const [OPEN, CLOSED, HALFWAY] = [0, 0.4, 0.7].map(steps) as [number, number, number];

describe("`paints` recolours a pose's drawings where its condition holds", () => {
  test("steps(3) samples the open pose, the closed pose and the halfway reopening frame", () => {
    expect([OPEN, CLOSED, HALFWAY]).toEqual([0, 1 / 3, 2 / 3]);
  });

  test("every variant bakes live with no diagnostics", () => {
    for (const variant of Object.keys(MASKED_VARIANTS) as Variant[]) {
      const artifact = bake(variant);
      expect(artifact.status, variant).toBe("live");
      expect(artifact.diagnostics, variant).toEqual([]);
    }
  });

  test("the masked variant shows the merged closed lash #c9c9c9 at the closed pose", () => {
    expect(fills(bake("masked"), CLOSED)).toEqual([GREY]);
  });

  test("the halfway reopening frame and the open poses keep the lashes' own colour", () => {
    const artifact = bake("masked");
    expect(fills(artifact, OPEN)).toEqual(["#111", "#111"]);
    expect(fills(artifact, HALFWAY)).toEqual(["#111", "#111"]);
    expect(fills(artifact, 1)).toEqual(["#111", "#111"]);
  });

  test("both tracks of the converging pair take the colour over the last `span` of the closing", () => {
    const artifact = bake("masked");
    const mixed = fills(artifact, 0.8 / 3);
    expect(mixed).toEqual(["rgba(109,109,109,1)", "rgba(109,109,109,1)"]);
    expect(fills(artifact, 0.5 / 3)).toEqual(["#111", "#111"]);
    expect(fills(artifact, 1 / 3 + 0.2 * (2 / 3))).toEqual(["rgba(109,109,109,1)", "rgba(109,109,109,1)"]);
  });

  test("with `span = 100%` the halfway reopening frame shows the sRGB midpoint", () => {
    const artifact = bake("masked", [{ ...ENTRY, span: "100%" }]);
    expect(fills(artifact, HALFWAY)).toEqual(["rgba(109,109,109,1)", "rgba(109,109,109,1)"]);
    expect(fills(artifact, CLOSED)).toEqual([GREY]);
  });

  test("with `span = 0%` only the pose's own drawings take the colour", () => {
    const artifact = bake("masked", [{ ...ENTRY, span: 0 }]);
    expect(fills(artifact, CLOSED)).toEqual([GREY]);
    expect(fills(artifact, 0.99 / 3)).not.toContain(GREY);
  });

  test("a variant that selects the mask without drawing a layer that needs it, and an unmasked one, keep the lashes' own colour", () => {
    for (const variant of ["maskOnly", "unmasked"] as const) {
      const artifact = bake(variant);
      expect(fills(artifact, CLOSED), variant).toEqual(["#111"]);
      expect(fills(artifact, 0.8 / 3), variant).not.toContain("rgba(109,109,109,1)");
    }
  });

  test("an entry without `when` applies in every variant", () => {
    const { when: _, ...always } = ENTRY;
    for (const variant of Object.keys(MASKED_VARIANTS) as Variant[]) {
      expect(fills(bake(variant, [always]), CLOSED), variant).toEqual([GREY]);
    }
  });

  test("the rest render equals the static image in every variant", () => {
    for (const variant of Object.keys(MASKED_VARIANTS) as Variant[]) {
      expect(bake(variant).rest, variant).toBe(bake(variant, []).rest);
      expect(renderMorphAt(bake(variant), OPEN), variant).toBe(renderMorphAt(bake(variant, []), OPEN));
    }
  });

  test("the later of two overlapping entries wins", () => {
    const red = { ...ENTRY, fill: "red" };
    expect(fills(bake("masked", [ENTRY, red]), CLOSED)).toEqual(["rgba(255,0,0,1)"]);
    expect(fills(bake("masked", [red, ENTRY]), CLOSED)).toEqual([GREY]);
  });

  test("a stroke entry leaves the fill as drawn", () => {
    const artifact = bake("masked", [{ targets: ["eyelash-left"], state: "eyes.closed", stroke: "#c9c9c9" }]);
    expect(fills(artifact, CLOSED)).toEqual(["#111"]);
  });

  test("a target drawing no driven group switches takes the colour at the pose and over the span", () => {
    const source = maskedPortrait().replace("</svg>", '<path data-name="shared" d="M0,0H10V10H0Z" fill="#111"/>\n</svg>');
    const shared = (paints: Record<string, unknown>[]) =>
      bakeMorphArtifact({ source, selection: { ...MASKED_VARIANTS.masked }, recipe: maskedBlink(paints), key: "shared", variant: "masked" });
    const artifact = shared([{ targets: ["shared"], state: "eyes.closed", fill: "red", span: "40%" }]);
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toEqual([]);
    expect(fills(artifact, CLOSED, "shared")).toEqual(["rgba(255,0,0,1)"]);
    expect(fills(artifact, 0.8 / 3, "shared")).toEqual(["rgba(136,8,8,1)"]);
    for (const offset of [OPEN, 0.5 / 3, HALFWAY, 1]) expect(fills(artifact, offset, "shared"), String(offset)).toEqual(["#111"]);
    expect(artifact.rest).toBe(shared([]).rest);
  });

  test("a target label the pose does not draw is reported on the artwork, where the entry applies", () => {
    const missing = { ...ENTRY, targets: ["eyelash-left", "eyelash-right"] };
    const masked = bake("masked", [missing]);
    expect(masked.status).toBe("live");
    expect(masked.diagnostics).toEqual([
      expect.objectContaining({ code: "paint-target-missing", severity: "warning", layer: "eyelash-right", uri: "file:///masked.svg", variant: "masked" }),
    ]);
    expect(masked.diagnostics[0]!.message).toContain("eyelash-right");
    expect(fills(masked, CLOSED)).toEqual([GREY]);
    expect(bake("unmasked", [missing]).diagnostics).toEqual([]);
  });
});
