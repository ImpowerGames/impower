import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { buildMorphRecipe } from "../../morph/recipe";
import { renderMorphAt } from "../../morph/render";
import type { MorphArtifact } from "../../morph/types";
import { parse } from "../../txml/txml";
import { blink, CLOSED, EYEBALL, LOWER_OPEN, UPPER_OPEN } from "./fixtures";

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

const shownNames = (svg: string) =>
  elements(svg)
    .filter((e) => e.attributes["data-name"] && !/display:\s*none/.test(e.attributes["style"] ?? "") && e.attributes["opacity"] !== "0")
    .map((e) => e.attributes["data-name"]!.split(" ")[0]);

const codes = (artifact: MorphArtifact) => artifact.diagnostics.map((d) => d.code);

const LID = "M10,10H90V40H10Z";

const switchPortrait = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<path data-name="face" d="M0,0H100V100H0Z" fill="#fdb"/>
<path data-name="lid lids.on" d="${LID}" fill="#a76"/>
</svg>`;

const lidsRecipe = () =>
  buildMorphRecipe("lower", {
    blend: "morph",
    method: "bend",
    fallback: "fade",
    keyframes: [
      { offset: 0, lids: { state: "off" } },
      { offset: 0.5, lids: { state: "on" } },
      { offset: 1, lids: { state: "off" } },
    ],
  });

describe("a switch's off state needs no layer of its own", () => {
  test("a portrait whose only lids layer is lids.on bakes live, showing the layer only at the on pose", () => {
    const artifact = bakeMorphArtifact({ source: switchPortrait, selection: {}, recipes: [lidsRecipe()], key: "k", variant: "lidded" });
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toEqual([]);
    expect(shownNames(renderMorphAt(artifact, 0))).not.toContain("lid");
    expect(shownNames(renderMorphAt(artifact, 0.5))).toContain("lid");
    expect(shownNames(artifact.rest)).not.toContain("lid");
    expect(shownNames(artifact.rest)).toContain("face");
  });
});

const shift = (d: string, dx: number, dy = 0) =>
  d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${Number(x) + dx},${Number(y) + dy}`);

const noEyeballPortrait = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100" width="140" height="100">
<path data-name="face" d="M0,0H140V100H0Z" fill="#fdb"/>
<g data-name="eyes.open default">
<path data-name="eye-line" d="${shift(UPPER_OPEN, 20, 10)}" fill="#111"/>
<path data-name="eye-line" d="${shift(LOWER_OPEN, 20, 10)}" fill="#111"/>
</g>
<g data-name="eyes.closed">
<path data-name="eye-line" d="${shift(CLOSED, 20, 10)}" fill="#111"/>
</g>
</svg>`;

describe("a clip entry is skipped on a portrait that draws none of its targets", () => {
  test("a portrait drawing none of the clip's targets or edges plays the rest of the morph", () => {
    const artifact = bakeMorphArtifact({ source: noEyeballPortrait, selection: {}, recipes: [blink()], key: "k", variant: "plain" });
    expect(artifact.status).toBe("live");
    expect(codes(artifact)).not.toContain("edge-missing");
    expect(codes(artifact)).not.toContain("target-missing");
    const open = elements(renderMorphAt(artifact, 0)).filter((e) => e.attributes["data-name"] === "eye-line" && !/display:\s*none/.test(e.attributes["style"] ?? ""));
    const closed = elements(renderMorphAt(artifact, 0.333)).filter((e) => e.attributes["data-name"] === "eye-line" && !/display:\s*none/.test(e.attributes["style"] ?? ""));
    expect(open.map((e) => e.attributes["d"])).not.toEqual(closed.map((e) => e.attributes["d"]));
    expect(closed.map((e) => e.attributes["d"])).toContain(shift(CLOSED, 20, 10));
  });

  test("a portrait drawing a clip target but none of its edges still reports edge-missing and bakes static", () => {
    const svg = noEyeballPortrait.replace(
      '<path data-name="eye-line" d="',
      `<path data-name="eyeball-white-left" d="${shift(EYEBALL, 20, 10)}" fill="#fff"/>\n<path data-name="eye-line" d="`,
    );
    const artifact = bakeMorphArtifact({ source: svg, selection: {}, recipes: [blink()], key: "k", variant: "plain" });
    expect(artifact.status).toBe("static");
    expect(artifact.diagnostics).toEqual([
      expect.objectContaining({ code: "target-missing", severity: "warning", layer: "pupil-left" }),
      expect.objectContaining({ code: "edge-missing", severity: "error" }),
    ]);
  });

  test("a target the portrait draws only in a pose the morph drives still applies the entry", () => {
    const svg = noEyeballPortrait.replace(
      '<g data-name="eyes.closed">',
      `<g data-name="eyes.closed">\n<path data-name="pupil-left" d="${shift(EYEBALL, 20, 10)}" fill="#234"/>`,
    );
    const artifact = bakeMorphArtifact({ source: svg, selection: {}, recipes: [blink()], key: "k", variant: "plain" });
    expect(artifact.status).toBe("static");
    expect(codes(artifact)).toContain("edge-missing");
    expect(codes(artifact)).toContain("target-missing");
  });
});
