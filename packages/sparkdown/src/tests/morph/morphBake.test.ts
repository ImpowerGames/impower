import { describe, expect, test } from "vitest";
import { filterSVGAttributes } from "../../attributes";
import { bakeMorphArtifact, MORPH_BAKE_SAMPLES } from "../../morph/bake";
import { parse } from "../../txml/txml";
import type { MorphArtifact, MorphTransition } from "../../morph/types";
import { blink, CLOSED, portrait, UPPER_OPEN } from "./fixtures";

const bake = (svg: string, recipe = blink(), selection: Record<string, string> = {}) =>
  bakeMorphArtifact({ source: svg, selection, recipe, key: "k1", variant: "bunny", uri: "file:///bunny.svg" });

const errors = (artifact: MorphArtifact) => artifact.diagnostics.filter((d) => d.severity === "error");

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

/** The shoelace area of a flat x, y loop. */
const area = (flat: number[]) => {
  let sum = 0;
  for (let i = 0; i < flat.length; i += 2) {
    const j = (i + 2) % flat.length;
    sum += flat[i]! * flat[j + 1]! - flat[j]! * flat[i + 1]!;
  }
  return Math.abs(sum) / 2;
};

describe("morph bake", () => {
  test("two open lashes converging on one closed lash give two shared tracks and one aperture that closes to nothing", () => {
    const artifact = bake(portrait());
    expect(errors(artifact)).toEqual([]);
    expect(artifact.status).toBe("live");
    const closing = artifact.segments[0]!;
    expect(closing.from.state).toBe("open");
    expect(closing.to.state).toBe("closed");
    const morphs = closing.transitions.filter((t) => t.kind === "morph");
    expect(morphs).toHaveLength(2);
    expect(morphs.every((t) => t.kind === "morph" && t.shared)).toBe(true);
    expect(closing.clips).toHaveLength(1);
    const loops = artifact.apertures[closing.clips[0]!.loops.index]!;
    expect(loops).toHaveLength(MORPH_BAKE_SAMPLES);
    // One aperture for one eye, open at the start and empty when closed.
    expect(loops[0]).toHaveLength(1);
    expect(area(loops[0]![0]!)).toBeGreaterThan(500);
    expect(area(loops[MORPH_BAKE_SAMPLES - 1]![0]!)).toBeLessThan(1e-3);
  });

  test("the reopening segment reuses the closing geometry played backwards", () => {
    const artifact = bake(portrait());
    const [closing, opening] = artifact.segments;
    expect(opening!.from.state).toBe("closed");
    expect(opening!.to.state).toBe("open");
    const refs = (transitions: MorphTransition[]) =>
      transitions.flatMap((t) => (t.kind === "morph" ? [t.frames] : []));
    const forward = refs(closing!.transitions);
    const backward = refs(opening!.transitions);
    expect(backward.map((r) => r.index).sort()).toEqual(forward.map((r) => r.index).sort());
    expect(forward.every((r) => !r.reversed)).toBe(true);
    expect(backward.every((r) => r.reversed)).toBe(true);
    expect(opening!.clips[0]!.loops).toEqual({ index: closing!.clips[0]!.loops.index, reversed: true });
    expect(artifact.frames).toHaveLength(2);
    // Two lashes converge by drawing on themselves; one lash opening into
    // two draws each track on its own destination.
    const draws = (transitions: MorphTransition[]) =>
      transitions.flatMap((t) => (t.kind === "morph" ? [t.draw === t.from ? "from" : "to"] : []));
    expect(draws(closing!.transitions)).toEqual(["from", "from"]);
    expect(draws(opening!.transitions)).toEqual(["to", "to"]);
  });

  test("clip-controlled backing holds through the segment instead of fading", () => {
    const artifact = bake(portrait());
    const [closing, opening] = artifact.segments;
    const holds = (s: typeof closing) => s!.transitions.filter((t) => t.kind === "hold");
    expect(holds(closing)).toHaveLength(2);
    expect(holds(opening)).toHaveLength(2);
    expect(closing!.transitions.some((t) => t.kind === "fade")).toBe(false);
  });

  test("state layers between static art split into ordered static and live parts", () => {
    const artifact = bake(portrait());
    expect(artifact.parts.map((p) => p.kind)).toEqual(["static", "live", "static"]);
    const [below, live, above] = artifact.parts.map((p) => elements(p.svg));
    expect(below!.some((e) => e.attributes["data-name"] === "face")).toBe(true);
    expect(above!.some((e) => e.attributes["data-name"] === "nose")).toBe(true);
    expect(live!.filter((e) => e.attributes["data-morph"]).length).toBe(5);
    // Written in the rest pose: the closed lash starts hidden, so the parts
    // composed as written are the rest render.
    const hidden = live!.filter((e) => e.attributes["data-morph"] && /display:none/.test(e.attributes["style"] ?? ""));
    expect(hidden.map((e) => e.attributes["d"])).toEqual([elements(portrait()).find((e) => e.attributes["d"]?.startsWith("M20,60 C50,54"))!.attributes["d"]]);
    // Every part keeps the root's sizing so the parts overlay exactly.
    for (const part of artifact.parts) {
      const root = elements(part.svg)[0]!;
      expect(root.attributes["viewBox"]).toBe("0 0 260 140");
      expect(root.attributes["width"]).toBe("260");
    }
  });

  test("each part carries the resources it references, under the artifact's prefix", () => {
    const artifact = bake(portrait());
    const below = elements(artifact.parts[0]!.svg);
    const gradient = below.find((e) => e.tagName === "linearGradient")!;
    expect(gradient.attributes["id"]).toBe(`${artifact.idPrefix}skin`);
    const face = below.find((e) => e.attributes["data-name"] === "face")!;
    expect(face.attributes["fill"]).toBe(`url(#${artifact.idPrefix}skin)`);
    // The nose part does not use the gradient, so it does not carry it.
    expect(elements(artifact.parts[2]!.svg).some((e) => e.tagName === "linearGradient")).toBe(false);
  });

  test("the rest render clips the targets to the open aperture and leaves the art untouched", () => {
    const svg = portrait();
    const artifact = bake(svg);
    const rest = elements(artifact.rest);
    const clipPaths = rest.filter((e) => e.tagName === "clipPath");
    expect(clipPaths).toHaveLength(2);
    const wrapped = rest.filter((e) => e.tagName === "g" && e.attributes["clip-path"]);
    expect(wrapped.map((g) => (g.children[0] as Element).attributes["data-name"])).toEqual([
      "eyeball-white-left",
      "pupil-left",
    ]);
    // The art itself is exactly the static render's: only wrappers are added.
    const plain = elements(filterSVGAttributes(svg, {}));
    const drawn = (list: Element[]) => list.filter((e) => e.tagName === "path" && e.attributes["data-name"]).map((e) => JSON.stringify(e.attributes));
    expect(drawn(rest)).toEqual(drawn(plain));
    expect(rest.some((e) => e.attributes["d"] === CLOSED)).toBe(false);
  });

  test("visibility lists which live nodes each state shows", () => {
    const artifact = bake(portrait());
    const eyes = artifact.visibility["eyes"]!;
    expect(eyes["open"]).toHaveLength(4);
    expect(eyes["closed"]).toHaveLength(1);
    expect(artifact.schedules["eyes"]!.map((k) => k.state)).toEqual(["open", "closed", "open"]);
  });

  test("morph frames are in the source element's own user space", () => {
    // The open lashes sit in a translated group; the closed lash does not.
    const artifact = bake(portrait({ openTransform: "translate(0 0)", dx: 20, dy: 10 }));
    const moved = bake(portrait({ openTransform: "translate(5 0)", dx: 20, dy: 10 }));
    expect(errors(moved)).toEqual([]);
    const first = (a: MorphArtifact) => a.frames[0]!.frames[0]!;
    // At the start pose each frame is the open lash in its own coordinates,
    // so the translation does not show up in the numbers.
    expect(first(moved).slice(0, 2)).toEqual(first(artifact).slice(0, 2));
    // At the end it lands on the closed lash, which in the translated
    // group's space is 5 units to the left.
    const last = (a: MorphArtifact) => a.frames[0]!.frames[MORPH_BAKE_SAMPLES - 1]!;
    expect(last(moved)[0]! - last(artifact)[0]!).toBeCloseTo(-5, 3);
  });

  test("an unchanged recipe on an unrelated selection bakes the same geometry", () => {
    const a = bake(portrait());
    const b = bake(portrait(), blink(), { eyes: "open" });
    expect(b.frames).toEqual(a.frames);
    expect(b.apertures).toEqual(a.apertures);
  });

  test("the start pose of the first frame is the authored open lash", () => {
    const artifact = bake(portrait({ dx: 0, dy: 0 }));
    const frame = artifact.frames[0]!.frames[0]!;
    const xs = frame.filter((_, i) => i % 2 === 0);
    // The handoff polyline sits on the authored outline: within its bounds.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(100.5);
    expect(UPPER_OPEN.startsWith("M0,50")).toBe(true);
  });
});
