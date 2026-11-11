import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { buildMorphRecipe, morphPoseAt, morphRestPose } from "../../morph/recipe";
import type { MorphArtifact } from "../../morph/types";
import { parse } from "../../txml/txml";

const square = (name: string, id: string, y: number) => `<path data-name="${name}" id="${id}" d="M0,${y}H10V${y + 10}H0Z"/>`;

const TEETH_LAYER = square("lips:mouth.teeth", "m-teeth", 60);

const FACE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
${square("lids:eyes.open:default", "e-open", 0)}
${square("lids:eyes.closed", "e-closed", 15)}
${square("lips:mouth.open:default", "m-open", 30)}
${square("lips:mouth.closed", "m-closed", 45)}
${TEETH_LAYER}
</svg>`;

const WIDE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
${square("lips:mouth.open", "m-open", 30)}
${square("wide:mouth.open-wide:default", "m-wide", 75)}
${square("lips:mouth.closed", "m-closed", 45)}
</svg>`;

const flap = (keyframes: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  buildMorphRecipe("flap", { blend: "cut", fallback: "cut", keyframes, ...extra });

const CLOSED_OPEN_CLOSED = [
  { offset: 0, mouth: { state: "closed" } },
  { offset: 0.5, mouth: { state: "open" } },
  { offset: 1, mouth: { state: "closed" } },
];

const TEETH = { rest: { mouth: { state: "teeth" } } };

const bake = (recipe = flap(CLOSED_OPEN_CLOSED, TEETH), selection: Record<string, string> = {}, source = FACE): MorphArtifact =>
  bakeMorphArtifact({ source, selection, recipes: [recipe], key: "k", variant: "face" });

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

const ids = (svg: string) => elements(svg).flatMap((e) => (e.attributes["id"] ? [e.attributes["id"].split("_").pop()] : []));

const nodeOf = (artifact: MorphArtifact, id: string) => {
  for (const part of artifact.parts) {
    const found = elements(part.svg).find((e) => e.attributes["id"]?.split("_").pop() === id && e.attributes["data-morph"]);
    if (found) return found.attributes["data-morph"];
  }
  return undefined;
};

describe("a morph's rest in the bake", () => {
  test("the rest render shows the morph's rest in its driven groups and the look's own choices elsewhere", () => {
    const artifact = bake(undefined, { eyes: "closed" });
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const shown = ids(artifact.rest);
    expect(shown).toContain("m-teeth");
    expect(shown).toContain("e-closed");
    expect(shown).not.toContain("m-open");
    expect(shown).not.toContain("m-closed");
    expect(shown).not.toContain("e-open");
  });

  test("a rest state outside the keyframes needs no geometry: no segment moves to or from it", () => {
    const artifact = bake();
    expect(artifact.schedules["mouth"]).toEqual([
      { offset: 0, state: "closed" },
      { offset: 0.5, state: "open" },
      { offset: 1, state: "closed" },
    ]);
    expect(artifact.segments.flatMap((segment) => [segment.from.state, segment.to.state])).not.toContain("teeth");
    expect(artifact.visibility["mouth"]!["teeth"]).toEqual([nodeOf(artifact, "m-teeth")]);
  });

  test("without `rest`, a group rests in the state of the last keyframe that names it", () => {
    const recipe = flap([
      { offset: 0, mouth: { state: "closed" } },
      { offset: 1, mouth: { state: "open" } },
    ]);
    expect(morphRestPose(recipe)).toEqual({ mouth: "open" });
    const shown = ids(bake(recipe, { mouth: "closed" }).rest);
    expect(shown).toContain("m-open");
    expect(shown).not.toContain("m-closed");
  });

  test("a group the keyframes leave unset at a play's end holds its rest there", () => {
    const recipe = flap(
      [
        { offset: 0, mouth: { state: "closed" } },
        { offset: 0.5, mouth: { state: "open" } },
      ],
      TEETH,
    );
    expect(bake(recipe).schedules["mouth"]).toEqual([
      { offset: 0, state: "closed" },
      { offset: 0.5, state: "open" },
      { offset: 1, state: "teeth" },
    ]);
    expect(morphPoseAt(recipe, 1)).toEqual({ mouth: "teeth" });
    expect(morphPoseAt(recipe, 0)).toEqual({ mouth: "closed" });
  });

  test("a group the keyframes leave unset at a play's start holds its rest there", () => {
    const recipe = flap(
      [
        { offset: 0.25, mouth: { state: "closed" } },
        { offset: 1, mouth: { state: "open" } },
      ],
      TEETH,
    );
    expect(bake(recipe).schedules["mouth"]).toEqual([
      { offset: 0, state: "teeth" },
      { offset: 0.25, state: "closed" },
      { offset: 1, state: "open" },
    ]);
    expect(morphPoseAt(recipe, 0)).toEqual({ mouth: "teeth" });
  });

  test("a keyframe state the look's own choice is a kind of plays as the look's choice", () => {
    const artifact = bake(flap(CLOSED_OPEN_CLOSED), {}, WIDE);
    expect(artifact.status).toBe("live");
    const open = new Set(artifact.visibility["mouth"]!["open"]);
    expect(open.has(nodeOf(artifact, "m-wide")!)).toBe(true);
    expect(open.has(nodeOf(artifact, "m-open")!)).toBe(true);
    const shown = ids(artifact.rest);
    expect(shown).toContain("m-closed");
    expect(shown).not.toContain("m-wide");
  });

  test("a look whose drawing folder lacks the rest state bakes still, naming the morph", () => {
    const artifact = bake(undefined, {}, FACE.replace(TEETH_LAYER, ""));
    expect(artifact.status).toBe("static");
    expect(artifact.diagnostics[0]).toMatchObject({ code: "inactive-variant", morphs: ["flap"] });
    expect(artifact.diagnostics[0]!.message).toContain("`mouth.teeth`");
  });
});
