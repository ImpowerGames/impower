import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { namespaceMorphMarkup, renderMorphFrame } from "../../morph/render";
import { parse } from "../../txml/txml";
import { blink, CLOSED, portrait } from "./fixtures";

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

const shown = (list: Element[]) => list.filter((e) => e.attributes["data-morph"] && e.attributes["display"] !== "none");
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

  test("a static artifact plays as its rest render", () => {
    const disabled = bakeMorphArtifact({ source: portrait(), selection: { eyes: "closed" }, recipe: blink(), key: "k2" });
    expect(disabled.status).toBe("static");
    expect(renderMorphFrame(disabled, { segment: 0, progress: 0.5 })).toBe(disabled.rest);
  });
});
