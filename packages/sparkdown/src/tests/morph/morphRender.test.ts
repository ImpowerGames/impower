import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { buildMorphRecipe } from "../../morph/recipe";
import { aperturePathData, namespaceMorphMarkup, renderMorphAt, renderMorphFrame } from "../../morph/render";
import { parse } from "../../txml/txml";
import { blink, CLOSED, LOWER_OPEN, portrait, shadowedPortrait, UPPER_OPEN } from "./fixtures";

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

const shown = (list: Element[]) => list.filter((e) => e.attributes["data-morph"] && !/display:none/.test(e.attributes["style"] ?? ""));
// Unshifted, so the closed lash's authored path data is the fixture's own.
const artifact = bakeMorphArtifact({ source: portrait({ dx: 0, dy: 0 }), selection: {}, recipe: blink(), key: "k", variant: "bunny" });

describe("artifact playback", () => {
  test("at a segment's start the live part shows the start pose", () => {
    const frame = elements(renderMorphFrame(artifact, { segment: 0, progress: 0 }));
    const visible = shown(frame).map((e) => e.attributes["data-name"]);
    expect(visible).toEqual(["eyeball-white-left", "pupil-left", "eyelash-left", "eyelash-left"]);
  });

  test("at the closed endpoint the shared closed lash is drawn once and the converging tracks are gone", () => {
    const frame = elements(renderMorphFrame(artifact, { segment: 0, progress: 1 }));
    const lashes = shown(frame).filter((e) => e.attributes["data-name"] === "eyelash-left");
    expect(lashes).toHaveLength(1);
    expect(lashes[0]!.attributes["d"]).toBe(CLOSED);
  });

  test("partway, the open lashes follow their frames and the aperture narrows", () => {
    const start = elements(renderMorphFrame(artifact, { segment: 0, progress: 0 }));
    const mid = elements(renderMorphFrame(artifact, { segment: 0, progress: 0.5 }));
    const d = (list: Element[]) => shown(list).filter((e) => e.attributes["data-name"] === "eyelash-left").map((e) => e.attributes["d"]);
    expect(d(mid)).toHaveLength(2);
    expect(d(mid)).not.toEqual(d(start));
    const aperture = (list: Element[]) => list.find((e) => e.tagName === "clipPath")!.children[0] as Element;
    expect(aperture(mid).attributes["d"]).not.toBe(aperture(start).attributes["d"]);
    // The clipped backing holds through the segment.
    expect(shown(mid).map((e) => e.attributes["data-name"])).toContain("eyeball-white-left");
  });

  test("the reopening segment plays the closing geometry backwards, one drawing per track", () => {
    const closing = elements(renderMorphFrame(artifact, { segment: 0, progress: 0.25 }));
    const opening = elements(renderMorphFrame(artifact, { segment: 1, progress: 0.75 }));
    const lashes = (list: Element[]) =>
      shown(list)
        .filter((e) => e.attributes["data-name"] === "eyelash-left")
        .map((e) => `${e.attributes["data-morph"]} ${e.attributes["d"]}`)
        .sort();
    // The closed lash splits into two on the way open: each track draws on
    // its own open lash, at the same pose the closing passed through.
    expect(lashes(opening)).toHaveLength(2);
    expect(lashes(opening)).toEqual(lashes(closing));
  });

  test("a reopening eye paints its moving shadow below the moving lashes", () => {
    const recipe = blink({
      clips: [{ between: ["eyelash-left"], targets: ["eyeball-white-left", "eyeball-shadow-left", "pupil-left"] }],
    });
    const shadowed = bakeMorphArtifact({ source: shadowedPortrait(), selection: {}, recipe, key: "shadowed" });
    expect(shadowed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(shadowed.status).toBe("live");
    for (const pose of [
      { segment: 0, progress: 0.9 },
      { segment: 1, progress: 0.1 },
    ]) {
      // Paint order is document order: the shadow, clipped to the opening,
      // stays under both lashes as the closed pose has it, so the lashes
      // cover whatever of it the opening does not.
      const drawn = shown(elements(renderMorphFrame(shadowed, pose)));
      const order = drawn.map((e) => e.attributes["data-name"]);
      expect(order.filter((name) => name === "eyelash-left")).toHaveLength(2);
      const shadows = drawn.filter((e) => e.attributes["data-name"] === "eyeball-shadow-left");
      expect(shadows).toHaveLength(1);
      // It is the moving shadow, on its way between the open and closed ones.
      expect([UPPER_OPEN, CLOSED]).not.toContain(shadows[0]!.attributes["d"]);
      expect(order.indexOf("eyeball-shadow-left")).toBeLessThan(order.indexOf("eyelash-left"));
    }
  });

  test("tracks sharing the drawing the variant rests on all paint at its depth", () => {
    // At rest one lash is drawn below the brow; the other state draws two
    // lashes above it.
    const merged = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
<g data-name="eyes.open:default"><path data-name="lash" d="${UPPER_OPEN}" fill="#111"/></g>
<path data-name="brow" d="M0,5H100V10H0Z" fill="#432"/>
<g data-name="eyes.closed"><path data-name="lash" d="${CLOSED}" fill="#111"/><path data-name="lash" d="${LOWER_OPEN}" fill="#111"/></g>
</svg>`;
    const recipe = blink({ clips: [] });
    const resting = bakeMorphArtifact({ source: merged, selection: {}, recipe, key: "merged" });
    expect(resting.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(resting.status).toBe("live");
    for (const pose of [
      { segment: 0, progress: 0.5 },
      { segment: 1, progress: 0.5 },
    ]) {
      const frame = elements(renderMorphFrame(resting, pose));
      const drawn = shown(frame).filter((e) => e.attributes["data-name"] === "lash");
      // Two shapes, each its own track, both below the brow.
      expect(drawn).toHaveLength(2);
      expect(drawn[0]!.attributes["d"]).not.toBe(drawn[1]!.attributes["d"]);
      const brow = frame.findIndex((e) => e.attributes["data-name"] === "brow");
      expect(Math.max(...drawn.map((e) => frame.indexOf(e)))).toBeLessThan(brow);
    }
    // At rest the copies stay hidden, so the parts compose to the still.
    const rest = shown(elements(renderMorphFrame(resting, { segment: 0, progress: 0 })));
    expect(rest.map((e) => e.attributes["d"])).toEqual([UPPER_OPEN]);
  });

  test("a basic shape the variant rests on keeps its own markup at rest and moves on paths", () => {
    const ellipses = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
<g data-name="eyes.open:default"><ellipse data-name="lash" cx="80" cy="60" rx="65" ry="45" fill="#111"/></g>
<g data-name="eyes.closed"><ellipse data-name="lash" cx="45" cy="60" rx="30" ry="20" fill="#111"/><ellipse data-name="lash" cx="115" cy="60" rx="30" ry="20" fill="#111"/></g>
</svg>`;
    const resting = bakeMorphArtifact({ source: ellipses, selection: {}, recipe: blink({ method: "match", clips: [] }), key: "ellipses" });
    expect(resting.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(resting.status).toBe("live");
    // The parts composed at rest draw the authored ellipse, as the still does.
    for (const offset of [0, 1]) {
      const rest = shown(elements(renderMorphAt(resting, offset)));
      expect(rest.map((e) => [e.tagName, e.attributes["cx"], e.attributes["rx"]])).toEqual([["ellipse", "80", "65"]]);
    }
    // In motion two paths carry the tracks where the ellipse sits, and the
    // ellipse itself is hidden.
    for (const segment of [0, 1]) {
      const moving = shown(elements(renderMorphFrame(resting, { segment, progress: 0.5 })));
      expect(moving.map((e) => e.tagName)).toEqual(["path", "path"]);
    }
  });

  test("each part fills the composed picture's viewport", () => {
    const frame = elements(renderMorphFrame(artifact, { segment: 0, progress: 0 }));
    const nested = frame.filter((e, i) => i > 0 && e.tagName === "svg");
    expect(nested).toHaveLength(artifact.parts.length);
    expect(nested.every((e) => e.attributes["width"] === "100%" && e.attributes["height"] === "100%")).toBe(true);
  });

  test("parts compose bottom to top in the source's paint order", () => {
    const frame = elements(renderMorphFrame(artifact, { segment: 0, progress: 0 }));
    const order = frame.filter((e) => e.attributes["data-name"] && e.tagName === "path").map((e) => e.attributes["data-name"]);
    expect(order[0]).toBe("face");
    expect(order[order.length - 1]).toBe("nose");
  });

  test("a per-copy prefix replaces every id and reference of a part", () => {
    const live = artifact.parts.find((p) => p.kind === "live")!.svg;
    const copy = namespaceMorphMarkup(live, artifact.idPrefix, "_copy7_");
    expect(copy).not.toContain(artifact.idPrefix);
    const ids = elements(copy).flatMap((e) => (e.attributes["id"] ? [e.attributes["id"]] : []));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith("_copy7_"))).toBe(true);
    const refs = elements(copy).flatMap((e) => (e.attributes["clip-path"] ? [e.attributes["clip-path"]] : []));
    expect(refs.every((r) => r.startsWith("url(#_copy7_"))).toBe(true);
  });

  test("a later segment hides the drawings of states it does not touch", () => {
    const HALF = "M0,50 C30,25 70,25 100,50 C70,40 30,40 0,50Z";
    const three = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
<g data-name="eyes.open:default"><path data-name="lash" d="${UPPER_OPEN}"/><path data-name="lash" d="${LOWER_OPEN}"/></g>
<g data-name="eyes.half"><path data-name="lash" d="${HALF}"/></g>
<g data-name="eyes.closed"><path data-name="lash" d="${CLOSED}"/></g>
</svg>`;
    const recipe = buildMorphRecipe("blink", {
      method: "bend",
      keyframes: [
        { offset: 0, eyes: { state: "open" } },
        { offset: 0.5, eyes: { state: "half" } },
        { offset: 1, eyes: { state: "closed" } },
      ],
    });
    const staged = bakeMorphArtifact({ source: three, selection: {}, recipe, key: "three" });
    expect(staged.segments.map((s) => `${s.from.state}>${s.to.state}`)).toEqual(["open>half", "half>closed"]);
    const closed = shown(elements(renderMorphFrame(staged, { segment: 1, progress: 1 })));
    expect(closed.map((e) => e.attributes["d"])).toEqual([CLOSED]);
  });

  test("a fade starts from the drawing's own inline opacity", () => {
    const faded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
<g data-name="eyes.open:default"><path data-name="crease" d="M10,20H40V25H10Z" style="opacity:0.4"/></g>
<g data-name="eyes.closed"><path data-name="other" d="M0,0H5V5H0Z"/></g>
</svg>`;
    const recipe = buildMorphRecipe("blink", { method: "bend", keyframes: [{ offset: 0, eyes: { state: "open" } }, { offset: 1, eyes: { state: "closed" } }] });
    const artifact = bakeMorphArtifact({ source: faded, selection: {}, recipe, key: "fade" });
    const crease = elements(renderMorphFrame(artifact, { segment: 0, progress: 0.5 })).find((e) => e.attributes["data-name"] === "crease")!;
    expect(crease.attributes["style"]).toBe("opacity:0.2");
    // An important inline opacity takes effect over a later normal one, and stays important.
    const important = bakeMorphArtifact({ source: faded.replace("opacity:0.4", "opacity:0.4 !important;opacity:0.9"), selection: {}, recipe, key: "fade2" });
    const marked = elements(renderMorphFrame(important, { segment: 0, progress: 0.5 })).find((e) => e.attributes["data-name"] === "crease")!;
    expect(marked.attributes["style"]).toBe("opacity:0.2 !important");
    // A comment after `!important` does not hide it.
    const commented = bakeMorphArtifact({ source: faded.replace("opacity:0.4", "opacity:0.4 !important /* note */;opacity:0.9"), selection: {}, recipe, key: "fade3" });
    const kept = elements(renderMorphFrame(commented, { segment: 0, progress: 0.5 })).find((e) => e.attributes["data-name"] === "crease")!;
    expect(kept.attributes["style"]).toBe("opacity:0.2 !important");
  });

  test("the aperture blends onto its closed line as the eye closes", () => {
    const clip = artifact.segments[0]!.clips[0]!;
    const nearly = aperturePathData(artifact.apertures[clip.loops.index]!, clip.loops, 0.99);
    const points = [...nearly.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i]!;
      const [x2, y2] = points[(i + 1) % points.length]!;
      sum += x1! * y2! - x2! * y1!;
    }
    // A hundredth of the way from the last open sample, the opening is a
    // sliver, not the half-open loop the previous sample held.
    expect(Math.abs(sum) / 2).toBeLessThan(20);
  });

  test("a nearly closed aperture stays on the bowed closed lash, not below it", () => {
    const clip = artifact.segments[0]!.clips[0]!;
    const nearly = aperturePathData(artifact.apertures[clip.loops.index]!, clip.loops, 0.99);
    const ys = [...nearly.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]));
    // The closed lash bows up from the line through its tips at y = 50; an
    // opening closing onto that chord would leave the lash's underside
    // uncovered and show what it clips there.
    expect(Math.min(...ys)).toBeLessThan(49);
  });

  test("a static artifact plays as its rest render", () => {
    const disabled = bakeMorphArtifact({ source: portrait(), selection: { eyes: "closed" }, recipe: blink(), key: "k2" });
    expect(disabled.status).toBe("static");
    expect(renderMorphFrame(disabled, { segment: 0, progress: 0.5 })).toBe(disabled.rest);
  });
});
