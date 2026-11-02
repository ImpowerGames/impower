import { describe, expect, test } from "vitest";
import { filterSVGAttributes } from "../../attributes";
import { bakeMorphArtifact, MORPH_BAKE_SAMPLES } from "../../morph/bake";
import { morphFrameState } from "../../morph/render";
import { parse } from "../../txml/txml";
import type { MorphArtifact, MorphTransition } from "../../morph/types";
import { blink, CLOSED, portrait, spreadBlink, spreadPortrait, UPPER_OPEN } from "./fixtures";

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
    const hidden = live!.filter((e) => e.attributes["data-morph"] && /display:none/.test(e.attributes["style"] ?? ""));
    expect(hidden.map((e) => e.attributes["d"])).toEqual([elements(portrait()).find((e) => e.attributes["d"]?.startsWith("M20,60 C50,54"))!.attributes["d"]]);
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
    expect(elements(artifact.parts[2]!.svg).some((e) => e.tagName === "linearGradient")).toBe(false);
  });

  test("the rest render masks the targets to the open aperture and leaves the art untouched", () => {
    const svg = portrait();
    const artifact = bake(svg);
    const rest = elements(artifact.rest);
    const masks = rest.filter((e) => e.tagName === "mask");
    expect(masks).toHaveLength(2);
    const wrapped = rest.filter((e) => e.tagName === "g" && e.attributes["mask"]);
    expect(wrapped.map((g) => (g.children[0] as Element).attributes["data-name"])).toEqual([
      "eyeball-white-left",
      "pupil-left",
    ]);
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
    const artifact = bake(portrait({ openTransform: "translate(0 0)", dx: 20, dy: 10 }));
    const moved = bake(portrait({ openTransform: "translate(5 0)", dx: 20, dy: 10 }));
    expect(errors(moved)).toEqual([]);
    const first = (a: MorphArtifact) => a.frames[0]!.frames[0]!;
    expect(first(moved).slice(0, 2)).toEqual(first(artifact).slice(0, 2));
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
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(100.5);
    expect(UPPER_OPEN.startsWith("M0,50")).toBe(true);
  });
});

describe("a drawing's `spread` in the bake", () => {
  const spreadBake = (layers: Parameters<typeof spreadBlink>[0] = {}, overrides: Record<string, unknown> = {}, variant = "bunny") =>
    bakeMorphArtifact({ source: spreadPortrait(), selection: {}, recipe: spreadBlink(layers, overrides), key: `k-${variant}`, variant, uri: "file:///spread.svg" });
  const live = (artifact: MorphArtifact) => artifact.parts.filter((p) => p.kind === "live").flatMap((p) => elements(p.svg));
  const nodeNamed = (artifact: MorphArtifact, label: string) => live(artifact).find((e) => e.attributes["data-name"] === label && e.attributes["data-morph"])!.attributes["data-morph"]!;
  const transitionOf = (artifact: MorphArtifact, label: string, segment = 0) => {
    const node = nodeNamed(artifact, label);
    return artifact.segments[segment]!.transitions.find((t) => ("from" in t && t.from === node) || ("node" in t && t.node === node))!;
  };
  const ignored = (artifact: MorphArtifact) => artifact.diagnostics.filter((d) => d.code === "spread-ignored");
  const spreadRecorded = (artifact: MorphArtifact) => artifact.segments.some((s) => "spread" in s || s.transitions.some((t) => "spread" in t));

  test("a morph whose drawings set no `spread`, or set `0`, bakes exactly what it bakes without the field", () => {
    const plain = spreadBake();
    expect(plain.diagnostics).toEqual([]);
    expect(plain).not.toHaveProperty("spreads");
    expect(spreadRecorded(plain)).toBe(false);
    const zero = spreadBake({ flat: { spread: 0 }, sheer: { spread: 0 } }, { spread: 0 });
    expect(zero).toEqual(plain);
  });

  test("a shrinking track records its spread and a mask in its live part, filled white and stroked black by twice the amount with a round, non-scaling stroke", () => {
    const artifact = spreadBake({ flat: { spread: "-1px" } });
    expect(ignored(artifact)).toEqual([]);
    const track = transitionOf(artifact, "flat");
    expect(track).toMatchObject({ kind: "morph", spread: -1 });
    if (track.kind !== "morph") throw new Error("not a morph");
    const record = artifact.spreads?.[track.draw];
    expect(record?.mask).toMatch(new RegExp(`^${artifact.idPrefix}morph-spread-`));
    expect(record).not.toHaveProperty("grow");
    const mask = live(artifact).find((e) => e.tagName === "mask" && e.attributes["id"] === record!.mask)!;
    expect(mask).toBeDefined();
    const path = mask.children[0] as Element;
    expect(path.attributes["style"]).toBe(
      "fill:#fff;fill-opacity:1;fill-rule:nonzero;stroke:#000;stroke-opacity:1;stroke-width:2px;stroke-dasharray:none;stroke-linejoin:round;visibility:visible;vector-effect:non-scaling-stroke",
    );
    const drawn = live(artifact).find((e) => e.attributes["data-morph"] === track.draw)!;
    expect(path.attributes["d"]).toBe(record!.outline);
    expect(path.attributes["d"]).toBe("M10,10C10,10 35,10 35,10C35,10 35,25 35,25C35,25 10,25 10,25C10,25 10,10 10,10Z");
    expect(drawn.attributes["d"]).toBe("M10,10H35V25H10Z");
    expect(drawn.attributes["style"] ?? "").not.toContain("mask");
    expect(artifact.rest).not.toContain("morph-spread");
  });

  test("a growing track records the paint its fill has: a colour, or an opaque gradient copy with the stops' shared opacity", () => {
    const artifact = spreadBake({ flat: { spread: "1px" }, sheer: { spread: "1px" }, veiled: { spread: "1px" }, mottled: { spread: "-1px" } });
    expect(ignored(artifact)).toEqual([]);
    const draw = (label: string) => (transitionOf(artifact, label) as { draw: string }).draw;
    expect(artifact.spreads?.[draw("flat")]).toEqual({ outline: expect.stringMatching(/Z$/), grow: { fill: [51, 68, 85, 1], "fill-opacity": 1 } });
    expect(artifact.spreads?.[draw("sheer")]).toEqual({ outline: expect.stringMatching(/Z$/), grow: { fill: [0, 170, 0, 1], "fill-opacity": 0.5 } });
    const veiled = artifact.spreads?.[draw("veiled")]?.grow;
    expect(veiled).toMatchObject({ alpha: 0.5, "fill-opacity": 1 });
    const copy = live(artifact).find((e) => !!veiled && "gradient" in veiled && e.attributes["id"] === veiled.gradient)!;
    expect(copy.tagName).toBe("linearGradient");
    expect(copy.children.map((stop) => (stop as Element).attributes["stop-color"])).toEqual(["rgba(255,0,0,1)", "rgba(255,255,0,1)"]);
    expect(artifact.spreads?.[draw("mottled")]?.mask).toBeDefined();
  });

  test.each([
    ["stroked", "-1px", "paints a stroke"],
    ["patterned", "1px", "has a fill that cannot be grown"],
    ["mottled", "1px", "has a fill that cannot be grown"],
    ["masked", "-1px", "has its own `mask`"],
    ["still", "-1px", "none of its drawings is drawn between poses or carried"],
    ["lettered", "-1px", "has no outline the bake reads exactly"],
    ["lettered", "1px", "has no outline the bake reads exactly"],
    ["doubled", "-1px", "is more than one contour"],
    ["crossing", "-1px", "is more than one contour"],
    ["ringed", "-1px", "is more than one contour"],
    ["cornered", "-1px", "is more than one contour"],
    ["holed", "-1px", "is more than one contour"],
    ["speck", "-1px", "is more than one contour"],
    ["looped", "-1px", "has a contour that overlaps itself with fill on both sides"],
    ["implicitloop", "-1px", "has a contour that overlaps itself with fill on both sides"],
    ["polylined", "1px", "is a `polyline`"],
  ])("`spread-ignored` on %s at `spread = %s` is reported once per artwork with one message for every variant, and the drawing keeps its own size", (label, spread, why) => {
    const messages = ["bunny", "raffles"].map((variant) => {
      const artifact = spreadBake({ [label]: { spread } }, {}, variant);
      const found = ignored(artifact);
      expect(found, variant).toEqual([expect.objectContaining({ severity: "warning", layer: label, variant })]);
      expect(found[0]!.message).toContain(why);
      expect(found[0]!.message).toContain(`\`spread = ${spread}\``);
      expect(spreadRecorded(artifact)).toBe(false);
      expect(artifact).not.toHaveProperty("spreads");
      return found[0]!.message;
    });
    expect(messages[0]).toBe(messages[1]);
  });

  test("a `paints` entry that strokes a growing drawing keeps it its own size, with `spread-ignored`, and its stroke shows between poses", () => {
    const paints = [{ targets: ["flat"], state: "eyes.closed", stroke: "#f00" }];
    const artifact = spreadBake({ flat: { spread: "1px" } }, { paints });
    const found = ignored(artifact);
    expect(found).toEqual([expect.objectContaining({ severity: "warning", layer: "flat" })]);
    expect(found[0]!.message).toContain("a `paints` entry's");
    expect(spreadRecorded(artifact)).toBe(false);
    const draw = (transitionOf(artifact, "flat") as { draw: string }).draw;
    const paint = morphFrameState(artifact, { eyes: { segment: 0, progress: 0.5 } }).paint.get(draw)!;
    expect(paint["stroke"]).toBe("rgba(255,0,0,0.5)");
    expect(paint).not.toHaveProperty("stroke-width");
  });

  test("growing is unaffected by contours: a drawing of several contours, or one overlapping itself, grows", () => {
    const labels = ["doubled", "crossing", "ringed", "cornered", "holed", "speck", "looped"];
    const artifact = spreadBake(Object.fromEntries(labels.map((label) => [label, { spread: "1px" }])));
    expect(ignored(artifact)).toEqual([]);
    for (const label of labels) expect(transitionOf(artifact, label), label).toMatchObject({ kind: "morph", spread: 1 });
  });

  test("a single contour looping over itself shrinks under an even-odd fill, where the loop is a hole and every edge bounds the fill", () => {
    const artifact = spreadBake({ loopedodd: { spread: "-1px" } });
    expect(ignored(artifact)).toEqual([]);
    const track = transitionOf(artifact, "loopedodd") as { draw: string };
    expect(track).toMatchObject({ kind: "morph", spread: -1 });
    expect(artifact.spreads![track.draw]).toMatchObject({ evenodd: true });
    const state = morphFrameState(artifact, { eyes: { segment: 0, progress: 0.5 } });
    expect(state.paint.get(track.draw)?.["mask"]).toBe(`url(#${artifact.spreads![track.draw]!.mask})`);
  });

  test("each drawing of a fade is tested with its own fill rule: an even-odd loop fading to a nonzero rectangle shrinks", () => {
    const artifact = spreadBake({ mixedfade: { spread: "-1px" } });
    expect(ignored(artifact)).toEqual([]);
    const fade = transitionOf(artifact, "mixedfade");
    expect(fade).toMatchObject({ kind: "fade", spread: -1 });
    if (fade.kind !== "fade") throw new Error("not a fade");
    expect(artifact.spreads![fade.from!]).toMatchObject({ evenodd: true });
    expect(artifact.spreads![fade.to!]).not.toHaveProperty("evenodd");
    const state = morphFrameState(artifact, { eyes: { segment: 0, progress: 0.5 } });
    for (const node of [fade.from!, fade.to!]) expect(state.paint.get(node)?.["mask"], node).toBe(`url(#${artifact.spreads![node]!.mask})`);
  });

  test("a single contour that folds over itself only between stored frames shrinks, with no `spread-ignored`", () => {
    const artifact = spreadBake({ folding: { spread: "-1px" } });
    expect(ignored(artifact)).toEqual([]);
    expect(transitionOf(artifact, "folding")).toMatchObject({ kind: "morph", spread: -1 });
  });

  test("each spread node records its own outline with every subpath closed, and a shrink mask starts from it", () => {
    const artifact = spreadBake({ opened: { spread: "-1px", blend: "fade" }, doubled: { spread: "1px" } });
    expect(ignored(artifact)).toEqual([]);
    const opened = nodeNamed(artifact, "opened");
    const record = artifact.spreads![opened]!;
    expect(record.outline).toMatch(/^M150,125(C[^MZ]+)+Z$/);
    const mask = live(artifact).find((e) => e.tagName === "mask" && e.attributes["id"] === record.mask)!;
    expect((mask.children[0] as Element).attributes["d"]).toBe(record.outline);
    const doubled = (transitionOf(artifact, "doubled") as { draw: string }).draw;
    expect(artifact.spreads![doubled]!.outline.match(/Z/g)).toHaveLength(2);
  });

  test("shrinking works whatever the fill is", () => {
    const artifact = spreadBake({ patterned: { spread: "-1px" }, mottled: { spread: "-1px" } });
    expect(ignored(artifact)).toEqual([]);
    expect(transitionOf(artifact, "patterned")).toMatchObject({ spread: -1 });
    expect(transitionOf(artifact, "mottled")).toMatchObject({ spread: -1 });
  });

  test("a root `spread` applies where no label sets one, and a label's `0` keeps its drawings their own size", () => {
    const artifact = spreadBake({ flat: { spread: 0 }, stroked: { spread: 0 }, masked: { spread: 0 }, lettered: { spread: 0 }, ...Object.fromEntries(["doubled", "crossing", "ringed", "cornered", "holed", "speck", "looped", "implicitloop"].map((label) => [label, { spread: 0 }])) }, { spread: "-1px" });
    expect(ignored(artifact)).toEqual([]);
    expect(transitionOf(artifact, "flat")).not.toHaveProperty("spread");
    expect(transitionOf(artifact, "blended")).toMatchObject({ spread: -1 });
    expect(transitionOf(artifact, "fader")).toMatchObject({ kind: "fade", spread: -1 });
    expect(transitionOf(artifact, "ghost")).toMatchObject({ kind: "scale", spread: -1 });
    expect(transitionOf(artifact, "still")).not.toHaveProperty("spread");
  });
});
