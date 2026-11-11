import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { buildMorphRecipe } from "../../morph/recipe";
import type { MorphArtifact, MorphRecipe } from "../../morph/types";
import { aperturePathData, morphFrameState, morphPosesAt, namespaceMorphMarkup, renderMorphAt, renderMorphFrame } from "../../morph/render";
import { parse } from "../../txml/txml";
import {
  blink,
  CLOSED,
  EYEBALL,
  LOWER_OPEN,
  MASKED_VARIANTS,
  maskedBlink,
  maskedPortrait,
  partnerPortrait,
  portrait,
  PUPIL,
  shadowedPortrait,
  SPLIT_CLOSED_BOTTOM_OVERLAPPING_TOP,
  SPLIT_CLOSED_TOP_SHORT_OF_OUTER_TIP,
  spreadBlink,
  spreadPortrait,
  UPPER_OPEN,
} from "./fixtures";

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
const artifact = bakeMorphArtifact({ source: portrait({ dx: 0, dy: 0 }), selection: {}, recipes: [blink()], key: "k", variant: "bunny" });

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
    const shadowed = bakeMorphArtifact({ source: shadowedPortrait(), selection: {}, recipes: [recipe], key: "shadowed" });
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
    const resting = bakeMorphArtifact({ source: merged, selection: {}, recipes: [recipe], key: "merged" });
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
    const resting = bakeMorphArtifact({ source: ellipses, selection: {}, recipes: [blink({ method: "match", clips: [] })], key: "ellipses" });
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
      bakeMorphArtifact({ source, selection: {}, recipes: [recipe], key: "k", variant: "pose" });
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
    const staged = bakeMorphArtifact({ source: three, selection: {}, recipes: [recipe], key: "three" });
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
    const artifact = bakeMorphArtifact({ source: faded, selection: {}, recipes: [recipe], key: "fade" });
    const crease = elements(renderMorphFrame(artifact, { segment: 0, progress: 0.5 })).find((e) => e.attributes["data-name"] === "crease")!;
    expect(crease.attributes["style"]).toBe("opacity:0.2");
    const important = bakeMorphArtifact({ source: faded.replace("opacity:0.4", "opacity:0.4 !important;opacity:0.9"), selection: {}, recipes: [recipe], key: "fade2" });
    const marked = elements(renderMorphFrame(important, { segment: 0, progress: 0.5 })).find((e) => e.attributes["data-name"] === "crease")!;
    expect(marked.attributes["style"]).toBe("opacity:0.2 !important");
    const spaced = bakeMorphArtifact({ source: faded.replace("opacity:0.4", "opacity:0.4\t!\nimportant ;opacity:0.9"), selection: {}, recipes: [recipe], key: "fade3" });
    const kept = elements(renderMorphFrame(spaced, { segment: 0, progress: 0.5 })).find((e) => e.attributes["data-name"] === "crease")!;
    expect(kept.attributes["style"]).toBe("opacity:0.2 !important");
    for (const [from, to] of [
      ["opacity:0.4", "opacity:40%"],
      ['style="opacity:0.4"', 'opacity="40%"'],
    ] as const) {
      const percent = bakeMorphArtifact({ source: faded.replace(from, to), selection: {}, recipes: [recipe], key: "fade4" });
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
    const disabled = bakeMorphArtifact({ source: portrait(), selection: { eyes: "closed" }, recipes: [blink()], key: "k2" });
    expect(disabled.status).toBe("static");
    expect(renderMorphFrame(disabled, { segment: 0, progress: 0.5 })).toBe(disabled.rest);
  });
});

describe("a drawing carried in its partner's shape", () => {
  const recipe = (start: string, other: string) =>
    buildMorphRecipe("blink", {
      blend: "morph",
      method: "bend",
      fallback: "fade",
      layers: { "eyeball-shadow-left": { partner: "eyelash-left" } },
      keyframes: [
        { offset: 0, eyes: { state: start } },
        { offset: 0.3, eyes: { state: other } },
        { offset: 0.6, eyes: { state: other } },
        { offset: 1, eyes: { state: start } },
      ],
      clips: [{ between: ["eyelash-left"], targets: ["eyeball-white-left", "eyeball-shadow-left", "pupil-left"] }],
    });
  const carried = bakeMorphArtifact({ source: partnerPortrait(), selection: {}, recipes: [recipe("open", "closed")], key: "carried", variant: "open" });
  const shadowNode = (artifact: MorphArtifact) => {
    const leaf = elements(artifact.parts.filter((p) => p.kind === "live").map((p) => p.svg).join("")).find((e) => e.attributes["data-name"] === "eyeball-shadow-left")!;
    return leaf.attributes["data-morph"]!;
  };
  const drawn = (svg: string, node: string) => shown(elements(svg)).filter((e) => e.attributes["data-morph"] === node);

  test("at the end of the closing, while the closed pose holds and at the start of the opening, the shadow draws as its arrival frame in its own paint", () => {
    expect(carried.diagnostics).toEqual([]);
    const shadow = shadowNode(carried);
    const arrival = carried.segments[0]!.carry!.to![shadow]!;
    expect(morphPosesAt(carried, 0.45)).toEqual({ eyes: { state: "closed", last: 0 } });
    for (const offset of [0.3, 0.45, 0.6]) {
      const state = morphFrameState(carried, morphPosesAt(carried, offset));
      expect(state.shown.has(shadow), String(offset)).toBe(true);
      expect(state.geometry.get(shadow), String(offset)).toBe(arrival);
      expect(state.paint.has(shadow), String(offset)).toBe(false);
      const [element] = drawn(renderMorphAt(carried, offset), shadow);
      expect(element?.attributes["d"], String(offset)).toBe(arrival);
      expect(element?.attributes["fill"], String(offset)).toBe("#ccc");
    }
  });

  test("away from the closed pose the shadow is its own drawing again", () => {
    const shadow = shadowNode(carried);
    for (const offset of [0, 1]) {
      const state = morphFrameState(carried, morphPosesAt(carried, offset));
      expect(state.shown.has(shadow)).toBe(true);
      expect(state.geometry.has(shadow)).toBe(false);
    }
  });

  test("a variant resting at the partner's pose draws no carried shadow at rest", () => {
    const resting = bakeMorphArtifact({ source: partnerPortrait(), selection: { eyes: "closed" }, recipes: [recipe("closed", "open")], key: "resting", variant: "closed" });
    expect(resting.status).toBe("live");
    expect(resting.diagnostics).toEqual([]);
    const shadow = shadowNode(resting);
    for (const offset of [0, 1]) {
      const state = morphFrameState(resting, morphPosesAt(resting, offset));
      expect(state.shown.has(shadow), String(offset)).toBe(false);
      expect([...state.geometry.keys()], String(offset)).toEqual([]);
      expect(drawn(renderMorphAt(resting, offset), shadow), String(offset)).toEqual([]);
    }
    expect(morphFrameState(resting, morphPosesAt(resting, 0.45)).shown.has(shadow)).toBe(true);
  });
});

describe("a `paints` entry on a drawing carried in its partner's shape", () => {
  const bakeWith = (fill: string, layer: Record<string, unknown> = {}) =>
    bakeMorphArtifact({
      source: partnerPortrait(),
      selection: {},
      recipes: [buildMorphRecipe("blink", {
        blend: "morph",
        method: "bend",
        fallback: "fade",
        layers: { "eyeball-shadow-left": { partner: "eyelash-left", ...layer } },
        keyframes: [
          { offset: 0, eyes: { state: "open" } },
          { offset: 0.3, eyes: { state: "closed" } },
          { offset: 0.6, eyes: { state: "closed" } },
          { offset: 1, eyes: { state: "open" } },
        ],
        paints: [{ targets: ["eyeball-shadow-left"], state: "eyes.closed", fill, span: "40%" }],
      })],
      key: "carried-paints",
      variant: "open",
    });
  const shadowOf = (artifact: MorphArtifact) =>
    elements(artifact.parts.filter((p) => p.kind === "live").map((p) => p.svg).join("")).find((e) => e.attributes["data-name"] === "eyeball-shadow-left")!.attributes["data-morph"]!;
  const fillAt = (artifact: MorphArtifact, offset: number) => morphFrameState(artifact, morphPosesAt(artifact, offset)).paint.get(shadowOf(artifact))?.["fill"];
  const alpha = (value: string | undefined) => (value === undefined ? undefined : Number(/rgba\(.*,([^,]+)\)/.exec(value)![1]));

  test("a transparent entry fades the shadow out over the closing's last 40%, holds it transparent while closed and mirrors it while opening", () => {
    const artifact = bakeWith("transparent");
    expect(artifact.diagnostics).toEqual([]);
    expect(fillAt(artifact, 0)).toBeUndefined();
    expect(fillAt(artifact, 0.15)).toBeUndefined();
    expect(alpha(fillAt(artifact, 0.27))).toBeCloseTo(0.25, 2);
    for (const offset of [0.3, 0.45, 0.6]) expect(alpha(fillAt(artifact, offset)), String(offset)).toBe(0);
    expect(alpha(fillAt(artifact, 0.64))).toBeCloseTo(0.25, 2);
    expect(fillAt(artifact, 0.8)).toBeUndefined();
    expect(fillAt(artifact, 1)).toBeUndefined();
  });

  test("an rgba() entry shows its colour on the held arrival frame", () => {
    const artifact = bakeWith("rgba(10, 20, 30, 0.5)");
    expect(artifact.diagnostics).toEqual([]);
    expect(fillAt(artifact, 0.45)).toBe("rgba(10,20,30,0.5)");
  });

  test.each(["scale", "fade"])("a carried arrival frame that blends in and out by %s takes the colour over the span, not at once", (blend) => {
    const artifact = bakeWith("transparent", { blend });
    expect(artifact.diagnostics).toEqual([]);
    const [arrival] = Object.keys(artifact.segments[0]!.carry!.to!);
    expect(Object.keys(artifact.segments[1]!.carry!.from!)).toEqual([arrival]);
    expect(artifact.segments[0]!.transitions).toContainEqual(expect.objectContaining(blend === "scale" ? { kind: "scale", node: arrival, draw: arrival, direction: "grow" } : { kind: "fade", to: arrival }));
    const carriedFill = (offset: number) => morphFrameState(artifact, morphPosesAt(artifact, offset)).paint.get(arrival!)?.["fill"];
    expect(carriedFill(0.15)).toBeUndefined();
    expect(alpha(carriedFill(0.21))).toBeCloseTo(0.75, 2);
    expect(alpha(carriedFill(0.27))).toBeCloseTo(0.25, 2);
    expect(alpha(carriedFill(0.45))).toBe(0);
    expect(alpha(carriedFill(0.64))).toBeCloseTo(0.25, 2);
    expect(carriedFill(0.8)).toBeUndefined();
  });
});

describe("split closed lashes whose tips never meet", () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100" width="140" height="100">
<path data-name="face" d="M0,0H140V100H0Z" fill="#b76"/>
<g data-name="eyes.open:default">
<path data-name="eyeball-white-left" d="${EYEBALL}" fill="#fff"/>
<path data-name="eyeball-shadow-left" d="${UPPER_OPEN}" fill="#ccc"/>
<path data-name="pupil-left" d="${PUPIL}" fill="#000"/>
<path data-name="eyelash-top-left" d="${UPPER_OPEN}" fill="#111"/>
<path data-name="eyelash-bottom-left" d="${LOWER_OPEN}" fill="#111"/>
</g>
<g data-name="eyes.closed">
<path data-name="eyelash-top-left" d="${SPLIT_CLOSED_TOP_SHORT_OF_OUTER_TIP}" fill="#111"/>
<path data-name="eyelash-bottom-left" d="${SPLIT_CLOSED_BOTTOM_OVERLAPPING_TOP}" fill="#111"/>
</g>
</svg>`;
  const recipe = buildMorphRecipe("blink", {
    blend: "morph",
    method: "bend",
    fallback: "fade",
    layers: { "eyeball-shadow-left": { partner: "eyelash-top-left" } },
    keyframes: [
      { offset: 0, eyes: { state: "open" } },
      { offset: 0.3, eyes: { state: "closed" } },
      { offset: 0.6, eyes: { state: "closed" } },
      { offset: 1, eyes: { state: "open" } },
    ],
    clips: [{ between: ["eyelash-top-left", "eyelash-bottom-left"], targets: ["eyeball-white-left", "eyeball-shadow-left", "pupil-left"] }],
  });
  const split = bakeMorphArtifact({ source, selection: {}, recipes: [recipe], key: "split", variant: "open" });
  const apertureArea = (svg: string) => {
    const mask = elements(svg).find((e) => e.tagName === "mask")!;
    const path = mask.children.find((c) => !!c && typeof c === "object" && (c as Element).tagName === "path") as Element;
    const points = [...path.attributes["d"]!.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i]!;
      const [x2, y2] = points[(i + 1) % points.length]!;
      sum += x1! * y2! - x2! * y1!;
    }
    return Math.abs(sum) / 2;
  };

  test("the closed keyframe and the closed hold draw an aperture with no area and no reach", () => {
    expect(split.status).toBe("live");
    expect(split.diagnostics).toEqual([]);
    for (const offset of [0.3, 0.45, 0.6]) {
      const svg = renderMorphAt(split, offset);
      expect(apertureArea(svg), String(offset)).toBeLessThan(1e-3);
      expect(elements(svg).some((e) => e.tagName === "clipPath" && e.attributes["id"]?.endsWith("-reach")), String(offset)).toBe(false);
    }
    expect(apertureArea(renderMorphAt(split, 0))).toBeGreaterThan(1000);
  });
});

describe("a `paints` entry's `opacity` on a drawing that fades at its pose", () => {
  test("the fade's factor multiplies the entry's opacity", () => {
    const source = maskedPortrait().replace(
      '<g data-name="eyes.closed">',
      '<g data-name="eyes.closed">\n<path data-name="eyeshadow" d="M100,0H110V10H100Z" fill="#536" opacity="0.9"/>',
    );
    const faded = bakeMorphArtifact({
      source,
      selection: { ...MASKED_VARIANTS.masked },
      recipes: [maskedBlink([{ targets: ["eyeshadow"], state: "eyes.closed", opacity: 0.5 }])],
      key: "faded",
      variant: "masked",
    });
    expect(faded.status).toBe("live");
    const opacityAt = (progress: number) =>
      shown(elements(renderMorphFrame(faded, { segment: 0, progress }))).filter((e) => e.attributes["data-name"] === "eyeshadow").map((e) => /opacity:([^;!]+)/.exec(e.attributes["style"] ?? "")?.[1]?.trim());
    expect(opacityAt(0.5)).toEqual(["0.25"]);
    expect(opacityAt(1)).toEqual(["0.5"]);
  });

  test.each(["morph", "scale"])("an `opacity` entry fades a drawing its partner carries over the span, blending in by %s", (blend) => {
    const artifact = bakeMorphArtifact({
      source: partnerPortrait(),
      selection: {},
      recipes: [buildMorphRecipe("blink", {
        blend: "morph",
        method: "bend",
        fallback: "fade",
        layers: { "eyeball-shadow-left": { partner: "eyelash-left", ...(blend === "scale" ? { blend } : {}) } },
        keyframes: [
          { offset: 0, eyes: { state: "open" } },
          { offset: 0.3, eyes: { state: "closed" } },
          { offset: 0.6, eyes: { state: "closed" } },
          { offset: 1, eyes: { state: "open" } },
        ],
        paints: [{ targets: ["eyeball-shadow-left"], state: "eyes.closed", opacity: 0, span: "40%" }],
      })],
      key: `carried-opacity-${blend}`,
      variant: "open",
    });
    expect(artifact.diagnostics).toEqual([]);
    const [arrival] = Object.keys(artifact.segments[0]!.carry!.to!);
    const opacityAt = (offset: number) => morphFrameState(artifact, morphPosesAt(artifact, offset)).paint.get(arrival!)?.["opacity"];
    expect(opacityAt(0.15)).toBeUndefined();
    expect(Number(opacityAt(0.27))).toBeCloseTo(0.25, 2);
    for (const offset of [0.3, 0.45, 0.6]) expect(opacityAt(offset), String(offset)).toBe("0");
    expect(Number(opacityAt(0.64))).toBeCloseTo(0.25, 2);
    expect(opacityAt(0.8)).toBeUndefined();
  });
});

describe("a clip entry's `spread` between poses", () => {
  const bake = (spread?: string | number) =>
    bakeMorphArtifact({
      source: portrait(),
      selection: {},
      recipes: [blink({ clips: [{ between: ["eyelash-left"], targets: ["eyeball-white-left", "pupil-left"], ...(spread === undefined ? {} : { spread }) }] })],
      key: "spread",
      variant: "open",
    });
  const MOVING = [0.1, 0.2, 0.5, 0.8];
  const firstPaths = (svg: string) =>
    elements(svg)
      .filter((e) => e.tagName === "mask" && /morph-clip-/.test(e.attributes["id"] ?? ""))
      .map((mask) => ({
        style: (mask.children.find((c) => !!c && typeof c === "object" && (c as Element).tagName === "path") as Element).attributes["style"] ?? "",
        reach: mask.children.some((c) => !!c && typeof c === "object" && (c as Element).tagName === "clipPath"),
      }));
  const base = bake();

  test("a positive spread strokes the aperture at twice its value through the default's trimmed reach", () => {
    expect(base.status).toBe("live");
    const wide = bake("3px");
    expect(wide.status).toBe("live");
    let reached = 0;
    for (const offset of MOVING) {
      const a = morphFrameState(base, morphPosesAt(base, offset));
      const b = morphFrameState(wide, morphPosesAt(wide, offset));
      expect([...b.reaches.keys()], String(offset)).toEqual([...a.reaches.keys()]);
      for (const [id, reach] of a.reaches) {
        reached += 1;
        expect(reach.spread).toBe(1);
        expect(b.reaches.get(id)).toEqual({ spread: 3, d: reach.d });
      }
      for (const path of firstPaths(renderMorphAt(wide, offset)).filter((p) => p.reach)) expect(path.style).toContain("stroke-width:6px");
    }
    expect(reached).toBeGreaterThan(0);
  });

  test("a negative spread strokes black with no reach clip", () => {
    const narrow = bake("-1px");
    let stroked = 0;
    for (const offset of MOVING) {
      const state = morphFrameState(narrow, morphPosesAt(narrow, offset));
      for (const reach of state.reaches.values()) expect(reach).toEqual({ spread: -1 });
      const paths = firstPaths(renderMorphAt(narrow, offset));
      for (const path of paths) {
        expect(path.reach).toBe(false);
        expect(path.style).toContain("stroke:#000;stroke-opacity:1;stroke-width:2px");
        stroked += 1;
      }
    }
    expect(stroked).toBeGreaterThan(0);
  });

  test("a zero spread draws the aperture's area alone", () => {
    const none = bake(0);
    for (const offset of MOVING) {
      expect(morphFrameState(none, morphPosesAt(none, offset)).reaches.size, String(offset)).toBe(0);
      for (const path of firstPaths(renderMorphAt(none, offset))) {
        expect(path.reach).toBe(false);
        expect(path.style).toMatch(/stroke:none/);
      }
    }
  });

  test.each(["3px", "-1px", 0, undefined])("a held pose other than rest draws the area alone at spread %s", (spread) => {
    const artifact = bake(spread);
    const state = morphFrameState(artifact, morphPosesAt(artifact, 0.333));
    expect(state.clips.size).toBeGreaterThan(0);
    expect(state.reaches.size).toBe(0);
    for (const path of firstPaths(renderMorphAt(artifact, 0.333))) {
      expect(path.reach).toBe(false);
      expect(path.style).toMatch(/stroke:none/);
    }
  });
});

describe("a drawing's `spread` between poses", () => {
  const spreadBake = (layers: Parameters<typeof spreadBlink>[0], overrides: Record<string, unknown> = {}, states?: string[]) =>
    bakeMorphArtifact({ source: spreadPortrait(), selection: {}, recipes: [spreadBlink(layers, overrides, states)], key: "spread", variant: "spread", uri: "file:///spread.svg" });
  const live = (artifact: MorphArtifact) => artifact.parts.filter((p) => p.kind === "live").flatMap((p) => elements(p.svg));
  const drawOf = (artifact: MorphArtifact, label: string, segment = 0) => {
    const node = live(artifact).find((e) => e.attributes["data-name"] === label && e.attributes["data-morph"])!.attributes["data-morph"]!;
    const t = artifact.segments[segment]!.transitions.find((t) => ("from" in t && t.from === node) || ("to" in t && t.to === node) || ("node" in t && t.node === node))!;
    return t.kind === "morph" || t.kind === "scale" ? t.draw : node;
  };
  const at = (artifact: MorphArtifact, progress: number, segment = 0) => morphFrameState(artifact, { eyes: { segment, progress } });
  const MOVING = [0.125, 0.5, 0.875];
  const GROWN = { "fill-opacity": "1", "stroke-opacity": "1", "stroke-width": "2px", "stroke-dasharray": "none", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" };

  test("a shrinking track sets its drawing's mask strictly between the ends, with the frame's geometry, and none at either end, while held or at rest", () => {
    const artifact = spreadBake({ flat: { spread: "-1px" } }, {}, ["open", "closed", "closed", "open"]);
    const draw = drawOf(artifact, "flat");
    const mask = artifact.spreads![draw]!.mask!;
    for (const progress of MOVING) {
      const state = at(artifact, progress);
      expect(state.paint.get(draw)).toEqual({ mask: `url(#${mask})` });
      expect(state.masks.get(mask)).toEqual({ spread: -1, d: state.geometry.get(draw) });
      const rendered = elements(renderMorphFrame(artifact, { segment: 0, progress }));
      const posed = rendered.find((e) => e.tagName === "mask" && e.attributes["id"] === mask)!;
      expect((posed.children[0] as Element).attributes["d"]).toBe(state.geometry.get(draw));
      expect((posed.children[0] as Element).attributes["style"]).toContain("stroke:#000;stroke-opacity:1;stroke-width:2px");
      expect(rendered.find((e) => e.attributes["data-morph"] === draw)!.attributes["style"]).toContain(`mask:url(#${mask})`);
    }
    for (const progress of [0, 1]) {
      const state = at(artifact, progress);
      expect(state.masks.size, String(progress)).toBe(0);
      expect(state.paint.get(draw)?.["mask"], String(progress)).toBeUndefined();
    }
    const held = morphFrameState(artifact, morphPosesAt(artifact, 0.5));
    expect(held.masks.size).toBe(0);
    expect(held.spread.size).toBe(0);
    expect(renderMorphFrame(artifact, "rest")).toBe(artifact.rest);
    expect(renderMorphAt(artifact, 0)).not.toContain(`mask:url(#${mask})`);
    expect(renderMorphAt(artifact, 1)).not.toContain(`mask:url(#${mask})`);
  });

  test("a growing track writes a round, non-scaling stroke twice the amount wide in its fill's paint for a flat colour, a blended paint, a gradient copy and a `paints` colour", () => {
    const artifact = spreadBake(
      { flat: { spread: "1px" }, blended: { spread: "1px" }, graded: { spread: "1px" }, tinted: { spread: "1px" } },
      { paints: [{ targets: ["tinted"], state: "eyes.closed", fill: "#0f0" }] },
    );
    expect(artifact.diagnostics).toEqual([]);
    const state = at(artifact, 0.5);
    expect(state.paint.get(drawOf(artifact, "flat"))).toEqual({ fill: "rgba(51,68,85,1)", stroke: "rgba(51,68,85,1)", ...GROWN });
    expect(state.paint.get(drawOf(artifact, "blended"))).toEqual({ fill: "rgba(128,0,128,1)", stroke: "rgba(128,0,128,1)", ...GROWN });
    const graded = state.paint.get(drawOf(artifact, "graded"))!;
    expect(graded["fill"]).toMatch(/^url\(#.*morph-gradient-\d+\)$/);
    expect(graded).toEqual({ fill: graded["fill"], stroke: graded["fill"], ...GROWN });
    const tinted = state.paint.get(drawOf(artifact, "tinted"))!;
    expect(tinted).toEqual({ fill: "rgba(68,196,68,1)", stroke: "rgba(68,196,68,1)", ...GROWN });
    for (const label of ["flat", "blended", "graded", "tinted"]) expect(state.opacity.get(drawOf(artifact, label)), label).toBeUndefined();
    for (const progress of [0, 1]) expect(at(artifact, progress).paint.get(drawOf(artifact, "flat")), String(progress)).toBeUndefined();
  });

  test("a see-through fill grows opaque with its alpha moved onto the drawing's opacity, so the band and the fill composite once", () => {
    const artifact = spreadBake({ sheer: { spread: "2px" }, veiled: { spread: "1px" } });
    expect(artifact.diagnostics).toEqual([]);
    const state = at(artifact, 0.5);
    const sheer = drawOf(artifact, "sheer");
    expect(state.paint.get(sheer)).toEqual({ fill: "rgba(0,170,0,1)", stroke: "rgba(0,170,0,1)", ...GROWN, "stroke-width": "4px" });
    expect(state.opacity.get(sheer)).toBe(0.5);
    const veiled = drawOf(artifact, "veiled");
    const fill = state.paint.get(veiled)!["fill"]!;
    expect(state.paint.get(veiled)).toEqual({ fill, stroke: fill, ...GROWN });
    const copy = /^url\(#(.*)\)$/.exec(fill)![1]!;
    expect(state.gradients.get(copy)!.stops.map((stop) => stop["stop-color"])).toEqual(["rgba(128,0,128,1)", "rgba(128,255,128,1)"]);
    expect(state.opacity.get(veiled)).toBe(0.5);
    const rendered = elements(renderMorphFrame(artifact, { segment: 0, progress: 0.5 })).find((e) => e.attributes["data-morph"] === sheer)!;
    expect(rendered.attributes["style"]).toContain("opacity:0.5");
  });

  test("both drawings of a fade and the `draw` leaf of a scale take their spread between the ends only", () => {
    const artifact = spreadBake({ fader: { spread: "-1px" }, ghost: { spread: "-1px" } });
    const fader = artifact.segments[0]!.transitions.find((t) => t.kind === "fade")!;
    const ghost = drawOf(artifact, "ghost");
    if (fader.kind !== "fade") throw new Error("not a fade");
    for (const progress of MOVING) {
      const state = at(artifact, progress);
      for (const node of [fader.from!, fader.to!, ghost]) {
        expect(state.paint.get(node)?.["mask"], `${node} ${progress}`).toBe(`url(#${artifact.spreads![node]!.mask})`);
      }
      expect(state.masks.get(artifact.spreads![ghost]!.mask!)).toEqual({ spread: -1, d: state.geometry.get(ghost) });
    }
    for (const progress of [0, 1]) expect(at(artifact, progress).masks.size, String(progress)).toBe(0);
  });

  test("a drawing closed only implicitly spreads along its closing edge: the mask and the grown geometry close every subpath", () => {
    const shrink = spreadBake({ opened: { spread: "-1px", blend: "fade" } });
    expect(shrink.diagnostics).toEqual([]);
    const node = drawOf(shrink, "opened");
    const record = shrink.spreads![node]!;
    expect(record.outline.endsWith("Z")).toBe(true);
    expect(at(shrink, 0.5).masks.get(record.mask!)).toEqual({ spread: -1, d: record.outline });
    const grow = spreadBake({ opened: { spread: "1px", blend: "fade" } });
    const grown = drawOf(grow, "opened");
    expect(at(grow, 0.5).geometry.get(grown)).toBe(grow.spreads![grown]!.outline);
    expect(at(grow, 0).geometry.has(grown)).toBe(false);
    const moving = spreadBake({ flat: { spread: "1px" } });
    const draw = drawOf(moving, "flat");
    const state = at(moving, 0.5);
    expect(state.geometry.get(draw)).toMatch(/Z$/);
    const scaled = spreadBake({ opened: { spread: "-1px", blend: "scale" } });
    expect(scaled.diagnostics).toEqual([]);
    const scales = scaled.segments[0]!.transitions.filter((t) => t.kind === "scale" && t.spread === -1);
    expect(scales).toHaveLength(2);
    const scaledState = at(scaled, 0.5);
    for (const t of scales) {
      if (t.kind !== "scale") continue;
      const frame = scaledState.geometry.get(t.draw)!;
      expect(frame.endsWith("Z")).toBe(false);
      expect(scaledState.masks.get(scaled.spreads![t.draw]!.mask!)).toEqual({ spread: -1, d: `${frame}Z` });
    }
  });

  test("a drawing refused for its contours draws exactly what it draws without spread, so no slit is cut", () => {
    const plain = spreadBake({});
    for (const label of ["ringed", "cornered", "crossing"]) {
      const spread = spreadBake({ [label]: { spread: "-1px" } });
      expect(spread.diagnostics, label).toEqual([expect.objectContaining({ code: "spread-ignored", layer: label })]);
      for (const progress of [0.25, 3 / 7, 0.5, 0.75]) {
        expect(renderMorphFrame(spread, { segment: 0, progress }), `${label} ${progress}`).toBe(renderMorphFrame(plain, { segment: 0, progress }));
      }
    }
  });

  test("a single contour that folds over itself between stored frames keeps its mask on its unfolded frames and drops it on the folded ones", () => {
    const artifact = spreadBake({ folding: { spread: "-1px" } });
    expect(artifact.diagnostics).toEqual([]);
    const draw = drawOf(artifact, "folding");
    const mask = artifact.spreads![draw]!.mask!;
    for (const progress of [0.2, 0.43, 0.52, 0.8]) {
      const state = at(artifact, progress);
      expect(state.masks.get(mask), String(progress)).toEqual({ spread: -1, d: state.geometry.get(draw) });
      expect(state.paint.get(draw)?.["mask"], String(progress)).toBe(`url(#${mask})`);
    }
    for (const progress of [0.46, 0.48, 0.5]) {
      const state = at(artifact, progress);
      expect(state.masks.has(mask), String(progress)).toBe(false);
      expect(state.paint.get(draw)?.["mask"], String(progress)).toBeUndefined();
      expect(renderMorphFrame(artifact, { segment: 0, progress }), String(progress)).not.toContain(`mask:url(#${mask})`);
    }
  });

  test("an edge label's `spread` leaves the clip's opening and its reach unchanged", () => {
    const plain = bakeMorphArtifact({ source: portrait(), selection: {}, recipes: [blink()], key: "edge", variant: "edge" });
    const spread = bakeMorphArtifact({ source: portrait(), selection: {}, recipes: [blink({ layers: { "eyelash-left": { spread: "-1px" } } })], key: "edge", variant: "edge" });
    expect(spread.diagnostics).toEqual(plain.diagnostics);
    expect(spread.apertures).toEqual(plain.apertures);
    expect(spread.apertureEdges).toEqual(plain.apertureEdges);
    for (const offset of [0.05, 0.15, 0.25, 0.5, 0.8]) {
      const a = morphFrameState(plain, morphPosesAt(plain, offset));
      const b = morphFrameState(spread, morphPosesAt(spread, offset));
      expect(b.clips, String(offset)).toEqual(a.clips);
      expect(b.reaches, String(offset)).toEqual(a.reaches);
    }
    expect(morphFrameState(spread, morphPosesAt(spread, 0.15)).masks.size).toBeGreaterThan(0);
  });
});