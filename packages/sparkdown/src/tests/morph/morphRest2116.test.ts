import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { buildMorphRecipe, morphPoseAt, morphRestPose } from "../../morph/recipe";
import type { MorphArtifact } from "../../morph/types";
import { parse } from "../../txml/txml";
import { morphFrameState, morphPosesAt } from "../../morph/render";
import { MorphTimeline } from "../../morph/timeline";
import { blink, CLOSED, EYEBALL, LOWER_OPEN, partnerPortrait, portrait, shiftPath, UPPER_OPEN } from "./fixtures";

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

  test("a keyframe state shows exactly that state, not a hyphenated state the look chooses", () => {
    const artifact = bake(flap(CLOSED_OPEN_CLOSED), {}, WIDE);
    expect(artifact.status).toBe("live");
    const open = new Set(artifact.visibility["mouth"]!["open"]);
    expect(open.has(nodeOf(artifact, "m-wide")!)).toBe(false);
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

const twoMorphFace = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
${square("lids:eyes.open:default", "e-open", 0)}
${square("lids:eyes.closed", "e-closed", 15)}
${square("lips:mouth.closed:default", "m-closed", 30)}
${square("lips:mouth.open", "m-open", 45)}
${TEETH_LAYER}
</svg>`;

const between = (name: string, group: string, a: string, b: string, rest?: string) =>
  buildMorphRecipe(name, {
    blend: "cut",
    keyframes: [{ offset: 0, [group]: { state: a } }, { offset: 1, [group]: { state: b } }],
    ...(rest ? { rest: { [group]: { state: rest } } } : {}),
  });

const maskLoops = (svg: string): number[][] => {
  const loops: number[][] = [];
  const visit = (nodes: unknown[], inside: boolean) => {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const element = node as Element;
      const masking = inside || element.tagName === "mask" || element.tagName === "clipPath";
      if (masking && element.tagName === "path") loops.push((element.attributes["d"] ?? "").match(/-?[0-9.]+/g)?.map(Number) ?? []);
      visit(element.children, masking);
    }
  };
  const doc = parse(svg);
  visit(Array.isArray(doc) ? doc : [doc], false);
  return loops;
};

const loopArea = (flat: number[]) => {
  let sum = 0;
  for (let i = 0; i + 3 < flat.length; i += 2) sum += flat[i]! * flat[i + 3]! - flat[i + 2]! * flat[i + 1]!;
  return Math.abs(sum) / 2;
};

describe("a morph's rest beside other poses", () => {
  test("a morph with no offset beside a playing morph shows its own rest, not its first keyframe", () => {
    const artifact = bakeMorphArtifact({
      source: twoMorphFace,
      selection: {},
      key: "two",
      recipes: [between("blink", "eyes", "open", "closed"), between("talk", "mouth", "closed", "open", "teeth")],
    });
    expect(artifact.status).toBe("live");
    expect(artifact.rests).toEqual({ eyes: "closed", mouth: "teeth" });
    const frame = morphFrameState(artifact, morphPosesAt(artifact, { blink: 0 }));
    expect(artifact.visibility["mouth"]!["teeth"]!.every((node) => frame.shown.has(node))).toBe(true);
    expect(artifact.visibility["mouth"]!["closed"]!.some((node) => frame.shown.has(node))).toBe(false);
  });

  test("a rest no keyframe names is clipped by its own opening, not by the first keyframe's", () => {
    const art = partnerPortrait({
      more: { half: `<path data-name="eyelash-left" d="${UPPER_OPEN}" transform="translate(0 6)"/><path data-name="eyelash-left" d="${LOWER_OPEN}" transform="translate(0 -6)"/>` },
    });
    const recipe = (ends: string) =>
      blink({
        rest: { eyes: { state: "open" } },
        keyframes: [
          { offset: 0, eyes: { state: ends } },
          { offset: 0.5, eyes: { state: "half" } },
          { offset: 1, eyes: { state: ends } },
        ],
      });
    const bake = (ends: string) => bakeMorphArtifact({ source: art, selection: {}, recipes: [recipe(ends)], key: `rest-${ends}` });
    const reached = bake("open");
    const outside = bake("closed");
    expect(reached.status).toBe("live");
    expect(outside.status).toBe("live");
    const area = (svg: string) => maskLoops(svg).reduce((sum, loop) => sum + loopArea(loop), 0);
    const open = area(reached.rest);
    expect(open).toBeGreaterThan(100);
    expect(Math.abs(area(outside.rest) - open) / open).toBeLessThan(0.05);
  });

  test("a rest no keyframe names, drawn with one closed edge, is clipped shut like the same drawing reached by a keyframe", () => {
    const drawings = `<path data-name="eyeball-white-left" d="${EYEBALL}" fill="#fff"/><path data-name="eyelash-left" d="${CLOSED}" fill="#111"/>`;
    const art = partnerPortrait({ closed: drawings, more: { asleep: drawings } });
    const bake = (rest: string) => bakeMorphArtifact({ source: art, selection: {}, recipes: [blink({ rest: { eyes: { state: rest } } })], key: `rest-${rest}` });
    const area = (svg: string) => maskLoops(svg).reduce((sum, loop) => sum + loopArea(loop), 0);
    const outside = bake("asleep");
    const reached = bake("closed");
    const open = bake("open");
    expect(outside.status).toBe("live");
    expect(outside.diagnostics).toEqual([]);
    expect(area(open.rest)).toBeGreaterThan(100);
    expect(area(reached.rest)).toBeLessThan(area(open.rest) / 5);
    expect(area(outside.rest)).toBeLessThan(1);
  });

  test("one clip holding both eyes closes each eye a rest outside the keyframes draws with one lash, beside an eye it draws open", () => {
    const left = (path: string) => `<path data-name="eyelash-left" d="${shiftPath(path, 20, 10)}" fill="#111"/>`;
    const right = (path: string) => `<path data-name="eyelash-right" d="${shiftPath(path, 140, 10)}" fill="#111"/>`;
    const rightWhite = `<path data-name="eyeball-white-right" d="${shiftPath(EYEBALL, 140, 10)}" fill="#fff"/>`;
    const art = (drawings: string) => portrait({ right: true }).replace("</svg>", `<g data-name="eyes.asleep">${drawings}</g></svg>`);
    const clips = [{ between: ["eyelash-left", "eyelash-right"], targets: ["eyeball-white-left", "pupil-left", "eyeball-white-right", "pupil-right"] }];
    const bake = (drawings: string) =>
      bakeMorphArtifact({ source: art(drawings), selection: {}, recipes: [blink({ rest: { eyes: { state: "asleep" } }, clips }, true)], key: "asleep" });
    const openLoops = (svg: string) => maskLoops(svg).filter((loop) => loopArea(loop) > 100);
    const shut = bake(left(CLOSED) + right(CLOSED));
    expect(shut.diagnostics).toEqual([]);
    expect(shut.status).toBe("live");
    expect(openLoops(shut.rest)).toEqual([]);
    const wink = bake(left(CLOSED) + rightWhite + right(UPPER_OPEN) + right(LOWER_OPEN));
    expect(wink.diagnostics).toEqual([]);
    expect(wink.status).toBe("live");
    const loops = openLoops(wink.rest);
    expect(loops.length).toBeGreaterThan(0);
    expect(Math.min(...loops.flatMap((loop) => loop.filter((_, i) => i % 2 === 0)))).toBeGreaterThanOrEqual(130);
  });

  test("a rest opening drawn away from the keyframes' openings lies inside its mask", () => {
    const away = `<g transform="translate(600 0)"><path data-name="eyeball-white-left" d="${EYEBALL}" fill="#fff"/><path data-name="eyelash-left" d="${UPPER_OPEN}"/><path data-name="eyelash-left" d="${LOWER_OPEN}"/></g>`;
    const art = partnerPortrait({ more: { away } }).replace('viewBox="0 0 140 100" width="140"', 'viewBox="0 0 750 100" width="750"');
    const artifact = bakeMorphArtifact({ source: art, selection: {}, recipes: [blink({ rest: { eyes: { state: "away" } } })], key: "away" });
    expect(artifact.status).toBe("live");
    const loops = maskLoops(artifact.rest).filter((loop) => loopArea(loop) > 100);
    expect(loops).not.toHaveLength(0);
    const xs = loops.flatMap((loop) => loop.filter((_, i) => i % 2 === 0));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(590);
    const mask = elements(artifact.rest).find((e) => e.tagName === "mask")!;
    const left = Number(mask.attributes["x"]);
    expect(left).toBeLessThanOrEqual(Math.min(...xs));
    expect(left + Number(mask.attributes["width"])).toBeGreaterThanOrEqual(Math.max(...xs));
  });

  test("a rest no keyframe names that draws none of a clip's edges bakes still, naming the clip", () => {
    const art = partnerPortrait({ more: { bare: `<path data-name="eyeball-white-left" d="${EYEBALL}" fill="#fff"/>` } });
    const artifact = bakeMorphArtifact({ source: art, selection: {}, recipes: [blink({ rest: { eyes: { state: "bare" } } })], key: "bare" });
    expect(artifact.status).toBe("static");
    expect(artifact.diagnostics).toEqual([expect.objectContaining({ code: "edge-missing", severity: "error" })]);
    expect(artifact.diagnostics[0]!.message).toContain("rest pose");
  });

  test("a morph waiting for its first play shows that play's directed start, which its still can show", () => {
    const recipe = buildMorphRecipe("blink", {
      method: "bend",
      keyframes: [
        { offset: 0, eyes: { state: "closed" } },
        { offset: 1, eyes: { state: "open" } },
      ],
    });
    const artifact = bakeMorphArtifact({ source: partnerPortrait(), selection: {}, recipes: [recipe], key: "eased" });
    const head = new MorphTimeline({ duration: 1, delay: 1, iterations: 1, direction: "normal", easing: "steps(2, start)" }, () => 0).at(0);
    expect(head).toEqual({ phase: "waiting", play: 0, offset: 0 });
    expect(morphPoseAt(recipe, 0)).toEqual({ eyes: "closed" });
    const frame = morphFrameState(artifact, morphPosesAt(artifact, 0));
    expect(frame.geometry.size).toBe(0);
    expect(artifact.visibility["eyes"]!["closed"]!.every((node) => frame.shown.has(node))).toBe(true);
  });
});
