import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { buildMorphRecipe } from "../../morph/recipe";
import type { MorphArtifact, MorphSegment, MorphTransition } from "../../morph/types";
import { parse } from "../../txml/txml";
import { CLOSED, partnerPortrait, shiftPath, type PartnerEyeOptions } from "./fixtures";

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

const contains = (element: Element, node: string): boolean =>
  element.attributes["data-morph"] === node ||
  element.children.some((child) => !!child && typeof child === "object" && contains(child as Element, node));

const CLIP = { between: ["eyelash-left"], targets: ["eyeball-white-left", "eyeball-shadow-left", "pupil-left"] };

const partnerBlink = (
  partner: unknown,
  { layer = {}, states = ["open", "closed", "open"], clips = [CLIP], ...rest }: { layer?: Record<string, unknown>; states?: string[]; clips?: unknown[] } & Record<string, unknown> = {},
) =>
  buildMorphRecipe("blink", {
    blend: "morph",
    method: "bend",
    fallback: "fade",
    layers: { "eyeball-shadow-left": { ...(partner === undefined ? {} : { partner }), ...layer } },
    keyframes: states.map((state, i) => ({ offset: i / (states.length - 1), eyes: { state } })),
    clips,
    ...rest,
  });

const bake = (recipe: ReturnType<typeof partnerBlink>, options: PartnerEyeOptions = {}, selection: Record<string, string> = {}) =>
  bakeMorphArtifact({ source: partnerPortrait(options), selection, recipe, key: "partner", variant: "partner", uri: "file:///partner.svg" });

const namesOf = (artifact: MorphArtifact) => {
  const names = new Map<string, string>();
  for (const part of artifact.parts) {
    if (part.kind !== "live") continue;
    for (const e of elements(part.svg)) {
      const node = e.attributes["data-morph"];
      if (node !== undefined && !names.has(node)) names.set(node, e.attributes["data-name"] ?? "");
    }
  }
  return names;
};

const leafOf = (artifact: MorphArtifact, state: string, name: string, index = 0): string => {
  const names = namesOf(artifact);
  const found = artifact.visibility["eyes"]![state]!.filter((node) => names.get(node) === name);
  return found[index]!;
};

const tracksOf = (artifact: MorphArtifact, segment: number, node: string): MorphTransition[] =>
  artifact.segments[segment]!.transitions.filter((t) => ("from" in t && t.from === node) || ("to" in t && t.to === node) || ("node" in t && t.node === node));

const box = (values: number[], lines: boolean | undefined) => {
  const xs: number[] = [];
  const ys: number[] = [];
  const step = lines ? 2 : 8;
  for (let i = 0; i + 1 < values.length; i += step) {
    xs.push(values[i]!);
    ys.push(values[i + 1]!);
    if (!lines) {
      xs.push(values[i + 6]!);
      ys.push(values[i + 7]!);
    }
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

describe("a label's `partner` lends it another label's drawing where its own pose draws none", () => {
  test("an open-only shadow with `partner = eyelash-left` morphs into the closed lash on its own node, with no paint record", () => {
    const artifact = bake(partnerBlink(["eyelash-left"]));
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toEqual([]);
    const shadow = leafOf(artifact, "open", "eyeball-shadow-left");
    const lash = leafOf(artifact, "closed", "eyelash-left");
    const tracks = tracksOf(artifact, 0, shadow);
    expect(tracks).toHaveLength(1);
    const track = tracks[0]!;
    expect(track).toMatchObject({ kind: "morph", from: shadow, to: lash, draw: shadow });
    expect(track).not.toHaveProperty("paint");
    if (track.kind !== "morph") throw new Error("not a morph");
    const frames = artifact.frames[track.frames.index]!;
    const last = track.frames.reversed ? frames.frames[0]! : frames.frames[frames.count - 1]!;
    const [minX, minY, maxX, maxY] = box(last, frames.lines);
    expect(minX).toBeCloseTo(0, 0);
    expect(maxX).toBeCloseTo(100, 0);
    expect(maxY).toBeCloseTo(52, 0);
    expect(minY).toBeCloseTo(47.5, 0);
  });

  test("the shadow is carried in the lash's shape at the closed pose and moves back out of it", () => {
    const artifact = bake(partnerBlink(["eyelash-left"]));
    const shadow = leafOf(artifact, "open", "eyeball-shadow-left");
    const lash = leafOf(artifact, "closed", "eyelash-left");
    const [closing, opening] = artifact.segments as [MorphSegment, MorphSegment];
    expect(Object.keys(closing.carry?.to ?? {})).toEqual([shadow]);
    expect(closing.carry?.from).toBeUndefined();
    expect(Object.keys(opening.carry?.from ?? {})).toEqual([shadow]);
    expect(opening.carry?.from?.[shadow]).toBe(closing.carry?.to?.[shadow]);
    expect(tracksOf(artifact, 1, shadow)).toEqual([expect.objectContaining({ kind: "morph", from: lash, to: shadow, draw: shadow, partner: true })]);
  });

  test("with the shadow's own name first, a closed shadow pairs by name and a closed eye without one moves the shadow to the lash", () => {
    const recipe = partnerBlink(["eyeball-shadow-left", "eyelash-left"]);
    const withShadow = bake(recipe, { closedShadow: true });
    expect(withShadow.diagnostics).toEqual([]);
    const own = leafOf(withShadow, "open", "eyeball-shadow-left");
    const closedShadow = leafOf(withShadow, "closed", "eyeball-shadow-left");
    expect(tracksOf(withShadow, 0, own)).toEqual([expect.objectContaining({ kind: "morph", from: own, to: closedShadow })]);
    expect(tracksOf(withShadow, 0, own)[0]).not.toHaveProperty("partner");
    expect(withShadow.segments[0]!.carry).toBeUndefined();
    const without = bake(recipe);
    const shadow = leafOf(without, "open", "eyeball-shadow-left");
    expect(tracksOf(without, 0, shadow)).toEqual([expect.objectContaining({ kind: "morph", from: shadow, to: leafOf(without, "closed", "eyelash-left"), partner: true })]);
  });

  test("without its own name, `partner = eyelash-left` moves the shadow to the lash even where a closed shadow is drawn", () => {
    const artifact = bake(partnerBlink(["eyelash-left"]), { closedShadow: true });
    const shadow = leafOf(artifact, "open", "eyeball-shadow-left");
    const lash = leafOf(artifact, "closed", "eyelash-left");
    expect(tracksOf(artifact, 0, shadow)).toEqual([expect.objectContaining({ kind: "morph", from: shadow, to: lash, partner: true })]);
  });

  test("of two listed labels a closed eye draws, the first listed decides, nearer or not", () => {
    const closed = `<path data-name="eyelash-top-left" d="${CLOSED}" fill="#111"/><path data-name="eyelash-bottom-left" d="${shiftPath(CLOSED, 0, 20)}" fill="#111"/>`;
    const moveOf = (list: string[]) => {
      const artifact = bake(partnerBlink(list, { clips: [] }), { closed });
      const shadow = leafOf(artifact, "open", "eyeball-shadow-left");
      const track = tracksOf(artifact, 0, shadow)[0]!;
      return namesOf(artifact).get((track as { to: string }).to);
    };
    expect(moveOf(["eyeball-shadow-left", "eyelash-left", "eyelash-bottom-left", "eyelash-top-left"])).toBe("eyelash-bottom-left");
    expect(moveOf(["eyeball-shadow-left", "eyelash-left", "eyelash-top-left", "eyelash-bottom-left"])).toBe("eyelash-top-left");
  });

  test("of two closed drawings of the deciding label, the shadow takes the one whose box centre is nearest its own", () => {
    const closed = `<path data-name="eyelash-left" d="${shiftPath(CLOSED, 0, 20)}" fill="#111"/><path data-name="eyelash-left" d="${CLOSED}" fill="#111"/>`;
    const artifact = bake(partnerBlink(["eyelash-left"], { clips: [] }), { closed });
    const shadow = leafOf(artifact, "open", "eyeball-shadow-left");
    const upper = leafOf(artifact, "closed", "eyelash-left", 1);
    expect(tracksOf(artifact, 0, shadow)).toEqual([expect.objectContaining({ kind: "morph", from: shadow, to: upper })]);
  });

  test.each([
    ["fade", "fade"],
    ["cut", "cut"],
    ["scale", "scale"],
  ])("`blend = %s` reaches the arrival frame, on a carrier where both shapes show", (blend) => {
    const artifact = bake(partnerBlink(["eyelash-left"], { layer: { blend } }));
    expect(artifact.diagnostics).toEqual([]);
    const shadow = leafOf(artifact, "open", "eyeball-shadow-left");
    const closing = artifact.segments[0]!;
    const [arrival, d] = Object.entries(closing.carry?.to ?? {})[0]!;
    expect(d).toBe(Object.values(artifact.segments[1]!.carry?.from ?? {})[0]);
    const kinds = closing.transitions.filter((t) => ("from" in t && t.from === shadow) || ("to" in t && t.to === arrival) || ("node" in t && (t.node === shadow || t.node === arrival)));
    if (blend === "cut") {
      expect(arrival).toBe(shadow);
      expect(kinds).toEqual([{ kind: "cut", from: shadow, to: shadow }]);
      expect(closing.shapes).toBeUndefined();
      return;
    }
    expect(arrival).not.toBe(shadow);
    expect(closing.shapes?.[arrival]).toBe(d);
    if (blend === "fade") expect(kinds).toEqual([{ kind: "fade", from: shadow, to: arrival }]);
    else {
      expect(kinds).toEqual([
        expect.objectContaining({ kind: "scale", node: shadow, draw: shadow, direction: "shrink" }),
        expect.objectContaining({ kind: "scale", node: arrival, draw: arrival, direction: "grow" }),
      ]);
    }
  });

  test("a three-pose morph carries the shadow from one lash onto the next, and leaves by its fallback from the carried shape toward a pose drawing neither", () => {
    const half = `<path data-name="eyelash-left" d="M0,50 C30,25 70,25 100,50 C70,40 30,40 0,50Z" fill="#111"/>`;
    const gone = `<path data-name="patch" d="M40,40H60V60H40Z" fill="#000"/>`;
    const artifact = bake(partnerBlink(["eyelash-left"], { clips: [], states: ["open", "half", "closed", "gone", "open"] }), { more: { half, gone } });
    const shadow = leafOf(artifact, "open", "eyeball-shadow-left");
    const halfLash = leafOf(artifact, "half", "eyelash-left");
    const closedLash = leafOf(artifact, "closed", "eyelash-left");
    const [toHalf, toClosed, toGone, toOpen] = artifact.segments as [MorphSegment, MorphSegment, MorphSegment, MorphSegment];
    expect(tracksOf(artifact, 0, shadow)).toEqual([expect.objectContaining({ kind: "morph", from: shadow, to: halfLash, draw: shadow })]);
    expect(toClosed.transitions).toContainEqual(expect.objectContaining({ kind: "morph", from: halfLash, to: closedLash, draw: shadow, partner: true }));
    expect(toClosed.carry?.from?.[shadow]).toBe(toHalf.carry?.to?.[shadow]);
    expect(toClosed.carry?.to?.[shadow]).toBeDefined();
    expect(toClosed.carry?.to?.[shadow]).not.toBe(toClosed.carry?.from?.[shadow]);
    const [carrier, d] = Object.entries(toGone.carry?.from ?? {})[0]!;
    expect(d).toBe(toClosed.carry?.to?.[shadow]);
    expect(toGone.shapes?.[carrier]).toBe(d);
    expect(toGone.transitions).toContainEqual({ kind: "fade", from: carrier });
    expect(toGone.carry?.to).toBeUndefined();
    expect(toOpen.carry).toBeUndefined();
    expect(artifact.diagnostics).toEqual([expect.objectContaining({ code: "partner-missing", severity: "warning", layer: "eyeball-shadow-left", variant: "partner" })]);
  });

  test("a shadow carried at the closed pose pairs by name with a shadow the next pose draws, from the shape it carries", () => {
    const half = `<path data-name="eyelash-left" d="M0,50 C30,25 70,25 100,50 C70,40 30,40 0,50Z" fill="#111"/><path data-name="eyeball-shadow-left" d="M0,50 C30,25 70,25 100,50 C70,40 30,40 0,50Z" fill="#999"/>`;
    const artifact = bake(partnerBlink(["eyeball-shadow-left", "eyelash-left"], { clips: [], states: ["open", "closed", "half", "open"] }), { more: { half } });
    expect(artifact.diagnostics).toEqual([]);
    const shadow = leafOf(artifact, "open", "eyeball-shadow-left");
    const closedLash = leafOf(artifact, "closed", "eyelash-left");
    const halfShadow = leafOf(artifact, "half", "eyeball-shadow-left");
    const [toClosed, toHalf] = artifact.segments as [MorphSegment, MorphSegment];
    expect(Object.keys(toClosed.carry?.to ?? {})).toEqual([shadow]);
    const track = toHalf.transitions.find((t) => t.kind === "morph" && t.to === halfShadow);
    expect(track).toMatchObject({ kind: "morph", from: closedLash, to: halfShadow, draw: shadow, partner: true });
    expect(track).toHaveProperty("paint.fill", [[204, 204, 204, 1], [153, 153, 153, 1]]);
    expect(toHalf.carry?.from?.[shadow]).toBe(toClosed.carry?.to?.[shadow]);
    expect(toHalf.carry?.to).toBeUndefined();
  });

  test("a morph resting at the partner's pose carries nothing at rest", () => {
    const artifact = bake(partnerBlink(["eyelash-left"], { states: ["closed", "open", "closed"] }), {}, { eyes: "closed" });
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toEqual([]);
    const shadow = leafOf(artifact, "open", "eyeball-shadow-left");
    const lash = leafOf(artifact, "closed", "eyelash-left");
    expect(artifact.segments.map((s) => s.carry)).toEqual([undefined, undefined]);
    expect(tracksOf(artifact, 0, shadow)).toEqual([expect.objectContaining({ kind: "morph", from: lash, to: shadow, draw: shadow, partner: true })]);
    expect(tracksOf(artifact, 1, shadow)).toEqual([expect.objectContaining({ kind: "morph", from: shadow, to: lash, draw: shadow, partner: true })]);
  });

  test("a shadow inside a clip target follows its partner inside its target's masked wrapper, on its own node and on a carrier", () => {
    for (const blend of ["morph", "fade"]) {
      const artifact = bake(partnerBlink(["eyelash-left"], { layer: { blend } }));
      const nodes = [...Object.keys(artifact.segments[0]!.carry?.to ?? {}), ...Object.keys(artifact.segments[0]!.shapes ?? {})];
      expect(nodes.length, blend).toBeGreaterThan(0);
      for (const part of artifact.parts.filter((p) => p.kind === "live")) {
        const masked = elements(part.svg).filter((e) => /^url\(#.*morph-clip/.test(e.attributes["mask"] ?? ""));
        for (const node of nodes) {
          const inside = masked.some((wrapper) => contains(wrapper, node));
          if (part.svg.includes(`data-morph="${node}"`)) expect(inside, `${blend} ${node}`).toBe(true);
        }
      }
    }
  });

  test("a `depth` on the shadow's label changes nothing", () => {
    const plain = bake(partnerBlink(["eyelash-left"]));
    const deep = bake(partnerBlink(["eyelash-left"], { layer: { depth: "eyes.closed" } }));
    expect(JSON.stringify(deep.segments)).toBe(JSON.stringify(plain.segments));
    expect(deep.parts).toEqual(plain.parts);
    expect(deep.diagnostics).toEqual(plain.diagnostics);
  });

  test("`partner-missing` is reported once per bake with a message every variant shares", () => {
    const recipe = partnerBlink(["eyelash-middle"]);
    const messages = ["one", "two"].map((variant) => {
      const artifact = bakeMorphArtifact({ source: partnerPortrait(), selection: {}, recipe, key: variant, variant, uri: "file:///partner.svg" });
      const missing = artifact.diagnostics.filter((d) => d.code === "partner-missing");
      expect(missing, variant).toHaveLength(1);
      expect(missing[0]).toMatchObject({ severity: "warning", layer: "eyeball-shadow-left", variant });
      return missing[0]!.message;
    });
    expect(messages[0]).toBe(messages[1]);
    expect(messages[0]).toContain('"eyelash-middle"');
  });
});
