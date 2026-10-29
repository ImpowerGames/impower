import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { buildMorphRecipe } from "../../morph/recipe";
import type { MorphArtifact, MorphRecipe } from "../../morph/types";
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
    const aperture = (list: Element[]) => list.find((e) => e.tagName === "mask")!.children.find((c) => !!c && typeof c === "object" && (c as Element).tagName === "path") as Element;
    expect(aperture(mid).attributes["d"]).not.toBe(aperture(start).attributes["d"]);
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
      const drawn = shown(elements(renderMorphFrame(shadowed, pose)));
      const order = drawn.map((e) => e.attributes["data-name"]);
      expect(order.filter((name) => name === "eyelash-left")).toHaveLength(2);
      const shadows = drawn.filter((e) => e.attributes["data-name"] === "eyeball-shadow-left");
      expect(shadows).toHaveLength(1);
      expect([UPPER_OPEN, CLOSED]).not.toContain(shadows[0]!.attributes["d"]);
      expect(order.indexOf("eyeball-shadow-left")).toBeLessThan(order.indexOf("eyelash-left"));
    }
  });

  test("tracks sharing the drawing the variant rests on all paint at its depth", () => {
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
      expect(drawn).toHaveLength(2);
      expect(drawn[0]!.attributes["d"]).not.toBe(drawn[1]!.attributes["d"]);
      const brow = frame.findIndex((e) => e.attributes["data-name"] === "brow");
      expect(Math.max(...drawn.map((e) => frame.indexOf(e)))).toBeLessThan(brow);
    }
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
    for (const offset of [0, 1]) {
      const rest = shown(elements(renderMorphAt(resting, offset)));
      expect(rest.map((e) => [e.tagName, e.attributes["cx"], e.attributes["rx"]])).toEqual([["ellipse", "80", "65"]]);
    }
    for (const segment of [0, 1]) {
      const moving = shown(elements(renderMorphFrame(resting, { segment, progress: 0.5 })));
      expect(moving.map((e) => e.tagName)).toEqual(["path", "path"]);
    }
  });

  describe("`depth` names the pose whose stacking a moving shape keeps", () => {
    const DOWN = "M10,60H30V90H10Z";
    const HALF = "M10,40H30V70H10Z";
    const RAISED = "M10,10H30V40H10Z";
    const TORSO = `<path data-name="torso" d="M0,30H60V100H0Z"/>`;
    const arm = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
<g data-name="arm.down:default"><path data-name="arm-left" d="${DOWN}"/></g>
${TORSO}
<g data-name="arm.raised"><path data-name="arm-left" d="${RAISED}"/></g>
</svg>`;
    const raise = (root: Record<string, unknown> = {}, states = ["down", "raised", "down"]) =>
      buildMorphRecipe("raise", {
        method: "match",
        keyframes: states.map((state, i) => ({ offset: i / (states.length - 1), arm: { state } })),
        ...root,
      });
    const bake = (recipe: MorphRecipe, source = arm) =>
      bakeMorphArtifact({ source, selection: {}, recipe, key: "k", variant: "pose" });
    const above = (frame: Element[], name: string, other: string) => {
      const at = frame.findIndex((e) => e.attributes["data-name"] === other);
      return shown(frame)
        .filter((e) => e.attributes["data-name"] === name)
        .map((e) => frame.indexOf(e) > at);
    };
    const midway = (artifact: MorphArtifact, segment = 0) => elements(renderMorphFrame(artifact, { segment, progress: 0.5 }));
    const ignored = (artifact: MorphArtifact) => artifact.diagnostics.filter((d) => d.code === "depth-ignored");

    test("a moving shape is drawn at the named pose's place between keyframes, in both directions", () => {
      const rest = bake(raise());
      const raised = bake(raise({ layers: { "arm-left": { depth: "arm.raised" } } }));
      expect(raised.status).toBe("live");
      expect(raised.diagnostics).toEqual([]);
      for (const segment of [0, 1]) {
        for (const progress of [0.1, 0.5, 0.9]) {
          expect(above(elements(renderMorphFrame(rest, { segment, progress })), "arm-left", "torso")).toEqual([false]);
          expect(above(elements(renderMorphFrame(raised, { segment, progress })), "arm-left", "torso")).toEqual([true]);
        }
      }
      for (const offset of [0, 0.5, 1]) {
        expect(renderMorphAt(raised, offset)).toBe(renderMorphAt(rest, offset));
      }
      expect(raised.rest).toBe(rest.rest);
    });

    test("segments that do not reach the named pose keep its stacking on its drawing of the label", () => {
      const staged = arm.replace(
        `${TORSO}`,
        `<g data-name="arm.half"><path data-name="arm-left" d="${HALF}"/></g>\n${TORSO}`,
      );
      const states = ["down", "half", "raised", "half", "down"];
      const plain = bake(raise({}, states), staged);
      const named = bake(raise({ layers: { "arm-left": { depth: "arm.raised" } } }, states), staged);
      expect(named.status).toBe("live");
      expect(named.diagnostics).toEqual([]);
      for (const segment of [0, 1, 2, 3]) {
        const frame = midway(named, segment);
        expect(above(frame, "arm-left", "torso"), `segment ${segment}`).toEqual([true]);
        expect(shown(frame).find((e) => e.attributes["data-name"] === "arm-left")!.attributes["d"]).not.toBe(RAISED);
      }
      expect(above(midway(plain, 0), "arm-left", "torso")).toEqual([false]);
      const drawn = (artifact: MorphArtifact, offset: number) =>
        shown(elements(renderMorphAt(artifact, offset))).map((e) => [e.attributes["data-name"], e.attributes["d"]]);
      for (const offset of [0, 0.25, 0.5, 0.75, 1]) {
        expect(drawn(named, offset)).toEqual(drawn(plain, offset));
      }
      expect(named.rest).toBe(plain.rest);
    });

    test("a drawing of the named pose that a segment holds keeps its own place while a copy carries the moving shape", () => {
      const HELD = "M100,60H120V90H100Z";
      const held = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
<g data-name="arm.down:default"><path data-name="arm-left" d="${DOWN}"/></g>
<g data-name="arm.half"><path data-name="arm-left" d="${HALF}"/></g>
${TORSO}
<g data-name="arm.down.half.raised"><path data-name="arm-left" d="${HELD}"/></g>
<g data-name="arm.off"><path data-name="other" d="M0,0H5V5H0Z"/></g>
</svg>`;
      const named = bake(raise({ depth: "arm.raised" }, ["down", "half", "raised", "off"]), held);
      expect(named.status).toBe("live");
      const frame = midway(named, 0);
      const arms = shown(frame).filter((e) => e.attributes["data-name"] === "arm-left");
      expect(arms.map((e) => e.attributes["d"])).toContain(HELD);
      expect(arms).toHaveLength(2);
      expect(above(frame, "arm-left", "torso")).toEqual([true, true]);
    });

    test("several drawings of the named pose are told apart by box centres that include their curves", () => {
      const curved = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
<g data-name="arm.down:default"><path data-name="arm-left" d="M30,60H70V80H30Z"/></g>
<g data-name="arm.half"><path data-name="arm-left" d="M30,62H70V82H30Z"/></g>
<g data-name="arm.raised"><path data-name="arm-left" d="M0,50C0,25 100,25 100,50Z"/></g>
${TORSO}
<g data-name="arm.raised"><path data-name="arm-left" d="M0,50C0,75 100,75 100,50Z"/></g>
</svg>`;
      const named = bake(raise({ depth: "arm.raised" }, ["down", "half", "raised"]), curved);
      expect(named.status).toBe("live");
      expect(above(midway(named, 0), "arm-left", "torso")).toEqual([true]);
    });

    test("a named-pose drawing whose geometry the bake cannot read is not used, and the label warns", () => {
      const unreadable = arm
        .replace(`${TORSO}`, `<g data-name="arm.half"><path data-name="arm-left" d="${HALF}"/></g>\n${TORSO}`)
        .replace(`d="${RAISED}"`, `d="${RAISED}" style="d:none"`);
      const states = ["down", "half", "raised"];
      const plain = bake(raise({}, states), unreadable);
      const named = bake(raise({ depth: "arm.raised" }, states), unreadable);
      expect(renderMorphFrame(named, { segment: 0, progress: 0.5 })).toBe(renderMorphFrame(plain, { segment: 0, progress: 0.5 }));
      expect(ignored(named)).toHaveLength(1);
    });

    test("the root's `depth` applies to every label, and a label's `depth = rest` undoes it", () => {
      expect(above(midway(bake(raise({ depth: "arm.raised" }))), "arm-left", "torso")).toEqual([true]);
      const undone = bake(raise({ depth: "arm.raised", layers: { "arm-left": { depth: "rest" } } }));
      expect(above(midway(undone), "arm-left", "torso")).toEqual([false]);
      expect(midway(bake(raise({ depth: "arm.down" })))).toEqual(midway(bake(raise())));
    });

    test("a label's `depth` reaches the moving shapes inside it", () => {
      const nested = arm.replace(/<path data-name="arm-left" d="([^"]+)"\/>/g, `<g data-name="limb"><path data-name="arm-left" d="$1"/></g>`);
      expect(above(midway(bake(raise({ layers: { limb: { depth: "arm.raised" } } }), nested)), "arm-left", "torso")).toEqual([true]);
    });

    test("tracks sharing one drawing in the named pose are each drawn at its place", () => {
      const lashes = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
<g data-name="eyes.open:default"><path data-name="lash" d="${UPPER_OPEN}" fill="#111"/><path data-name="lash" d="${LOWER_OPEN}" fill="#111"/></g>
<path data-name="brow" d="M0,5H100V10H0Z" fill="#432"/>
<g data-name="eyes.closed"><path data-name="lash" d="${CLOSED}" fill="#111"/></g>
</svg>`;
      const plain = bake(blink({ clips: [] }), lashes);
      const closed = bake(blink({ clips: [], layers: { lash: { depth: "eyes.closed" } } }), lashes);
      expect(closed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(closed.status).toBe("live");
      for (const segment of [0, 1]) {
        expect(above(midway(plain, segment), "lash", "brow")).toEqual([false, false]);
        const frame = midway(closed, segment);
        expect(above(frame, "lash", "brow")).toEqual([true, true]);
        const drawn = shown(frame).filter((e) => e.attributes["data-name"] === "lash");
        expect(drawn[0]!.attributes["d"]).not.toBe(drawn[1]!.attributes["d"]);
      }
      const rest = shown(elements(renderMorphFrame(closed, { segment: 0, progress: 0 })));
      expect(rest.map((e) => e.attributes["d"])).toEqual([UPPER_OPEN, LOWER_OPEN]);
    });

    test("a named pose that does not draw the label keeps the rest pose's place and warns once", () => {
      const staged = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
<g data-name="arm.down:default"><path data-name="arm-left" d="${DOWN}"/></g>
${TORSO}
<g data-name="arm.half"><path data-name="arm-left" d="${HALF}"/></g>
<g data-name="arm.raised"><path data-name="hand" d="M40,10H50V20H40Z"/></g>
</svg>`;
      const states = ["down", "half", "raised"];
      const plain = bake(raise({}, states), staged);
      const named = bake(raise({ layers: { "arm-left": { depth: "arm.raised" } } }, states), staged);
      expect(named.status).toBe("live");
      for (const progress of [0.25, 0.5, 0.75]) {
        expect(renderMorphFrame(named, { segment: 0, progress })).toBe(renderMorphFrame(plain, { segment: 0, progress }));
      }
      expect(ignored(named)).toHaveLength(1);
      expect(ignored(named)[0]).toMatchObject({ severity: "warning", layer: "arm-left", variant: "pose" });
      expect(ignored(named)[0]!.message).toContain("`depth = arm.raised`");
    });

    test("a one-sided shape under a label whose moving shapes the named pose draws reports nothing", () => {
      const cuffed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
<g data-name="arm.down:default"><g data-name="limb"><path data-name="arm-left" d="${DOWN}"/><path data-name="cuff" d="M10,88H30V92H10Z"/></g></g>
${TORSO}
<g data-name="arm.raised"><g data-name="limb"><path data-name="arm-left" d="${RAISED}"/></g></g>
</svg>`;
      const named = bake(raise({ layers: { limb: { depth: "arm.raised" } } }), cuffed);
      expect(named.status).toBe("live");
      expect(ignored(named)).toEqual([]);
      expect(above(midway(named), "arm-left", "torso")).toEqual([true]);
    });

    test("a label that changes with another group than the one `depth` names keeps its place and warns", () => {
      const other = bake(raise({ layers: { "arm-left": { depth: "eyes.closed" } } }));
      expect(midway(other)).toEqual(midway(bake(raise())));
      expect(ignored(other)).toHaveLength(1);
      expect(ignored(other)[0]!.message).toContain("`arm`");
    });
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
    const important = bakeMorphArtifact({ source: faded.replace("opacity:0.4", "opacity:0.4 !important;opacity:0.9"), selection: {}, recipe, key: "fade2" });
    const marked = elements(renderMorphFrame(important, { segment: 0, progress: 0.5 })).find((e) => e.attributes["data-name"] === "crease")!;
    expect(marked.attributes["style"]).toBe("opacity:0.2 !important");
    const spaced = bakeMorphArtifact({ source: faded.replace("opacity:0.4", "opacity:0.4\t!\nimportant ;opacity:0.9"), selection: {}, recipe, key: "fade3" });
    const kept = elements(renderMorphFrame(spaced, { segment: 0, progress: 0.5 })).find((e) => e.attributes["data-name"] === "crease")!;
    expect(kept.attributes["style"]).toBe("opacity:0.2 !important");
    for (const [from, to] of [
      ["opacity:0.4", "opacity:40%"],
      ['style="opacity:0.4"', 'opacity="40%"'],
    ] as const) {
      const percent = bakeMorphArtifact({ source: faded.replace(from, to), selection: {}, recipe, key: "fade4" });
      const halved = elements(renderMorphFrame(percent, { segment: 0, progress: 0.5 })).find((e) => e.attributes["data-name"] === "crease")!;
      expect(halved.attributes["style"], to).toBe("opacity:0.2");
    }
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
    expect(Math.abs(sum) / 2).toBeLessThan(20);
  });

  test("a nearly closed aperture stays on the bowed closed lash, not below it", () => {
    const clip = artifact.segments[0]!.clips[0]!;
    const nearly = aperturePathData(artifact.apertures[clip.loops.index]!, clip.loops, 0.99);
    const ys = [...nearly.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]));
    expect(Math.min(...ys)).toBeLessThan(49);
  });

  test("a static artifact plays as its rest render", () => {
    const disabled = bakeMorphArtifact({ source: portrait(), selection: { eyes: "closed" }, recipe: blink(), key: "k2" });
    expect(disabled.status).toBe("static");
    expect(renderMorphFrame(disabled, { segment: 0, progress: 0.5 })).toBe(disabled.rest);
  });
});
