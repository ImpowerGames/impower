import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost, inlineMorphSource, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { renderMorphAt } from "@impower/sparkdown/src/morph/render";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphArtifact, MorphRef, MorphTiming } from "@impower/sparkdown/src/morph/types";
import { blink, blinkScript, CLOSED, partnerPortrait, portrait, talkingPortrait, talkScript } from "@impower/sparkdown/src/tests/morph/fixtures";
import { backgroundRect, layerValue, svgIntrinsicSize } from "../../app/morph/backgroundFit";
import { MorphPlayback, type MorphImageContent } from "../../app/morph/MorphPlayback";
import UIManager from "../../app/managers/UIManager";
import type { Clock } from "../../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../../spark-engine/src/game/core/classes/Coordinator";
import { UpdateElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/UpdateElementMessage";
import { cssList } from "@impower/sparkdown/src/morph/cssList";
import { createDOMHarness, createStubApp, flushMicrotasks, installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const TIMING = `  timing {
    duration = 0.25
    easing = linear
    iterations = infinite
  }
`;

const SOURCE = `${blinkScript(TIMING)}


scene start
  HERO:
    [[show portrait bunny]]
    First line.
    Second line.
end
`;

const ART = portrait({ dx: 0, dy: 0 });
const PLAIN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#08f"/></svg>`;

const FILES = [
  { uri: "inmemory:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: ART },
  { uri: "inmemory:///cat.svg", type: "image", name: "cat", ext: "svg", data: PLAIN },
];

const COMPOSITION_FILES = [
  ...FILES,
  {
    uri: "inmemory:///base.svg",
    type: "image",
    name: "base",
    ext: "svg",
    data: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 140"><rect width="260" height="140" fill="#2a6"/></svg>`,
  },
  {
    uri: "inmemory:///hat.svg",
    type: "image",
    name: "hat",
    ext: "svg",
    data: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 140"><rect x="70" width="120" height="30" fill="#a2c"/></svg>`,
  },
];

const shiftRight =(d: string) => d.replace(/(-?[0-9.]+),(-?[0-9.]+)/g, (_m, x: string, y: string) => `${Number(x) + 120},${y}`);
const WINK_UPPER = "M20,50 C40,15 95,0 120,45 C110,40 100,24 85,26 C70,28 60,36 45,34 C35,33 28,44 20,50Z";
const WINK_LOWER = "M20,50 C30,52 45,60 60,58 C80,56 100,62 120,45 C95,72 50,75 20,50Z";
const WINK_CLOSED = "M20,50 C50,46 90,42 120,45 C90,48 50,52 20,50Z";
const WINK_WHITE = "M20,50 C40,15 95,0 120,45 C95,72 50,75 20,50Z";
const WINK_ART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 100" width="260" height="100">
<path data-name="face" d="M0,0H260V100H0Z" fill="#c96"/>
<g data-name="eyes.open:default">
<path data-name="eyeball-white-left" d="${WINK_WHITE}" fill="#fff"/>
<path data-name="eyelash-left" d="${WINK_UPPER}" fill="#111"/>
<path data-name="eyelash-left" d="${WINK_LOWER}" fill="#111"/>
<path data-name="eyelash-right" d="${shiftRight(WINK_CLOSED)}" fill="#111"/>
</g>
<g data-name="eyes.closed">
<path data-name="eyelash-left" d="${WINK_CLOSED}" fill="#111"/>
<path data-name="eyelash-right" d="${shiftRight(WINK_UPPER)}" fill="#111"/>
<path data-name="eyelash-right" d="${shiftRight(WINK_LOWER)}" fill="#111"/>
</g>
<path data-name="eyeball-white-right" d="${shiftRight(WINK_WHITE)}" fill="#fff"/>
</svg>`;
const WINK_SOURCE = SOURCE.replace(
  "      between {\n        eyelash-left\n      }",
  "      between {\n        eyelash-left\n        eyelash-right\n      }",
).replace("        pupil-left\n", "        eyeball-white-right\n");
const WINK_FILES = [{ uri: "inmemory:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: WINK_ART }];

const lineOf = (source: string, text: string) => source.split("\n").findIndex((l) => l.includes(text));

function manualFrames() {
  const queue: ((now: number) => void)[] = [];
  return {
    requestFrame: (cb: (now: number) => void) => queue.push(cb),
    cancelFrame: () => {},
    run(now: number) {
      const due = queue.splice(0);
      for (const cb of due) cb(now);
    },
    get pending() {
      return queue.length;
    },
  };
}

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

function leafStates(root: ParentNode): Record<string, { shown: boolean; d: string | null }[]> {
  const out: Record<string, { shown: boolean; d: string | null }[]> = {};
  for (const el of Array.from(root.querySelectorAll("[data-morph]"))) {
    const node = el.getAttribute("data-morph")!;
    const style = el.getAttribute("style") ?? "";
    (out[node] ??= []).push({ shown: !/display:\s*none/.test(style), d: el.getAttribute("d") });
  }
  return out;
}

function referenceStates(artifact: MorphArtifact, offset: number | Record<string, number>) {
  const doc = new DOMParser().parseFromString(renderMorphAt(artifact, offset), "image/svg+xml");
  return leafStates(doc);
}

function paintStates(root: ParentNode): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const el of Array.from(root.querySelectorAll("[data-morph]"))) {
    const style = el.getAttribute("style") ?? "";
    if (!/display:\s*none/.test(style)) (out[el.getAttribute("data-morph")!] ??= []).push(style);
  }
  return out;
}

function referencePaint(artifact: MorphArtifact, offset: number) {
  return paintStates(new DOMParser().parseFromString(renderMorphAt(artifact, offset), "image/svg+xml"));
}

function apertureStates(root: ParentNode): { d: string | null; style: string | null; reach?: string | null }[][] {
  return Array.from(root.querySelectorAll("mask")).map((mask) =>
    Array.from(mask.querySelectorAll(":scope > path")).map((path) => {
      const style = path.getAttribute("style");
      const bound = /clip-path:url\(#([^)]+)\)/.exec(style ?? "")?.[1];
      const reach = bound === undefined ? undefined : (mask.querySelector(`:scope > clipPath[id="${bound}"] > path`)?.getAttribute("d") ?? null);
      return { d: path.getAttribute("d"), style: style?.replace(/clip-path:url\(#[^)]+\)/, "clip-path:url(#reach)") ?? null, ...(reach === undefined ? {} : { reach }) };
    }),
  );
}

function referenceApertures(artifact: MorphArtifact, offset: number | Record<string, number>) {
  return apertureStates(new DOMParser().parseFromString(renderMorphAt(artifact, offset), "image/svg+xml"));
}

function portraitSpan(overlay: HTMLElement): HTMLElement | null {
  return overlay.querySelector(".portrait .image > .instance");
}

const shadowOf = (span: HTMLElement | null) => span?.querySelector(":scope > span.morph")?.shadowRoot ?? null;

function inProcessHost(program: () => any): MorphHost {
  return createMorphHost({
    service: new MorphBakeService(),
    channel: () => program().morphs,
    readSource: inlineMorphSource(() => program().context),
  });
}

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

describe("morph playback in the page", () => {
  async function previewed(source = SOURCE, files = FILES) {
    const writes: any[] = [];
    const h = createDOMHarness(source, 0, {
      files,
      afterEachMessage: (message) => {
        const ops = message?.method === "ui/batch" ? message.params.messages : [message];
        for (const op of ops) if (op?.method === "ui/write-image") writes.push(op);
      },
    });
    const frames = manualFrames();
    const playback = MorphPlayback.for(h.overlay);
    playback.configure({ host: inProcessHost(() => h.game.program), seed: "test", ...frames });
    await h.ready;
    await h.preview(lineOf(source, "First line."));
    await flushMicrotasks(10);
    return { h, frames, playback, writes };
  }

  test("a write carries a compact reference, and the static image shows until the artifact is ready", async () => {
    const { h, playback, writes } = await previewed();
    const write = writes.find((w) => w.params.target === "portrait" && w.params.instructions.length);
    expect(write).toBeDefined();
    const content = write.params.instructions[0].content;
    expect(content.morph.plays).toHaveLength(1);
    expect(content.morph.plays[0].ref).toMatchObject({ morphs: ["blink"], image: "bunny", groups: ["eyes"] });
    expect(content.morph.plays[0].layer).toBe(0);
    expect(JSON.stringify(content.morph).length).toBeLessThan(1000);
    expect(JSON.stringify(write)).not.toContain("data-morph");
    const span = portraitSpan(h.overlay)!;
    expect(playback.stats.live).toBe(0);
    expect(span.querySelector("span.morph")).toBeNull();
    await until(() => playback.stats.live === 1, "the artifact");
    expect(span.style.backgroundImage).toBe("none");
    const shadow = shadowOf(span)!;
    expect(shadow.querySelectorAll("svg > svg").length).toBeGreaterThan(1);
  });

  test("an image's place counts every image of a literal composed below it", async () => {
    const { h, writes } = await previewed();
    const literal = '"linear-gradient(red, blue), linear-gradient(black, white)"';
    await h.game.module.ui.image.write("portrait", [{ control: "show", assets: [literal, "bunny"] } as any], true);
    await flushMicrotasks(10);
    const write = writes.filter((w) => w.params.target === "portrait" && w.params.instructions.length).pop();
    const content = write.params.instructions[0].content;
    const images = cssList(content.background).reverse();
    expect(images).toHaveLength(3);
    expect(content.morph.plays.map((p: any) => p.layer)).toEqual([2]);
    expect(images[2]).toContain("url(");
  });

  test("a live morph composed between a lower and an upper image keeps every image in paint order", async () => {
    const { h, playback, writes } = await previewed(SOURCE, COMPOSITION_FILES);
    await h.game.module.ui.image.write("portrait", [{ control: "show", assets: ["base", "bunny", "hat"] } as any], true);
    await flushMicrotasks(10);
    const write = writes.filter((w) => w.params.target === "portrait" && w.params.instructions.length).pop();
    const images = cssList(write.params.instructions[0].content.background).reverse();
    expect(images).toHaveLength(3);
    expect(write.params.instructions[0].content.morph.plays.map((p: any) => p.layer)).toEqual([1]);
    await until(() => playback.stats.live === 1, "the composed artifact");
    const span = portraitSpan(h.overlay)!;
    expect(span.style.backgroundImage).toBe("none");
    const view = (playback as any).layers.values().next().value.images[0].view;
    const children = Array.from(shadowOf(span)!.children) as HTMLElement[];
    expect(children).toHaveLength(3);
    expect(children[1]).toBe(view.box);
    expect(children[1]!.querySelectorAll("[data-morph]").length).toBeGreaterThan(0);
    const computed = span.ownerDocument.defaultView!.getComputedStyle(span);
    for (const [index, fill] of [[0, "%232a6"], [2, "%23a2c"]] as const) {
      const style = children[index]!.getAttribute("style")!;
      expect(style).toContain(`background-image:${images[index]}`);
      expect(images[index]).toContain(fill);
      expect(style.startsWith("position:absolute;inset:0;")).toBe(true);
      for (const property of ["background-size", "background-position"]) {
        const value = layerValue(computed.getPropertyValue(property), 2 - index);
        if (value) expect(style).toContain(`${property}:${value}`);
      }
      expect(children[index]!.querySelector("[data-morph]")).toBeNull();
    }
  });

  test("inline art animates with the page's own host: the game bakes it and sends the artifact", async () => {
    const h = createDOMHarness(SOURCE, 0, { files: FILES });
    const playback = MorphPlayback.for(h.overlay);
    await h.ready;
    await h.preview(lineOf(SOURCE, "First line."));
    await flushMicrotasks(10);
    await until(() => playback.stats.live === 1, "the artifact the game sends");
    expect(shadowOf(portraitSpan(h.overlay))?.querySelectorAll("[data-morph]").length).toBeGreaterThan(0);
  });

  test("the game sends an inline artifact again when the page asks for a key it wrote, and only then", async () => {
    const sent: string[] = [];
    const h = createDOMHarness(SOURCE, 0, {
      files: FILES,
      afterEachMessage: (message) => {
        if (message?.method === "morph/artifact") sent.push(message.params.key);
      },
    });
    MorphPlayback.for(h.overlay);
    await h.ready;
    await h.preview(lineOf(SOURCE, "First line."));
    await until(() => sent.length >= 1, "the first delivery");
    await new Promise((r) => setTimeout(r, 200));
    const key = sent[0]!;
    const before = sent.length;
    expect(sent.every((k) => k === key)).toBe(true);
    h.game.connection.receive({ jsonrpc: "2.0", method: "morph/need", params: { key: "not-written" } } as any);
    h.game.connection.receive({ jsonrpc: "2.0", method: "morph/need", params: { key } } as any);
    await until(() => sent.length === before + 1, "the delivery asked for");
    await new Promise((r) => setTimeout(r, 200));
    expect(sent.slice(before)).toEqual([key]);
  });

  test("a write without a morph is the write it always was", async () => {
    const source = `

scene start
  HERO:
    [[show portrait cat]]
    Line.
end
`;
    const writes: any[] = [];
    const h = createDOMHarness(source, 0, {
      files: FILES,
      afterEachMessage: (message) => {
        const ops = message?.method === "ui/batch" ? message.params.messages : [message];
        for (const op of ops) if (op?.method === "ui/write-image") writes.push(op);
      },
    });
    await h.ready;
    await h.preview(lineOf(source, "Line."));
    await flushMicrotasks(10);
    const write = writes.find((w) => w.params.instructions.length);
    expect(write.params.instructions[0].content.morph).toBeUndefined();
    expect(portraitSpan(h.overlay)?.querySelector("span.morph")).toBeNull();
  });

  test("the stopped preview animates on the playback's own frames, posed as the reference renderer draws", async () => {
    const { h, frames, playback } = await previewed();
    await until(() => playback.stats.live === 1, "the artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = (playback as any).layers.values().next().value.images[0].slot.artifact as MorphArtifact;
    expect(frames.pending).toBeGreaterThan(0);
    frames.run(1000);
    const reaches = () => apertureStates(shadow).flatMap((paths) => paths.filter(({ style }) => !/stroke:\s*none/.test(style ?? "")));
    expect(apertureStates(shadow)).toEqual(referenceApertures(artifact, 0));
    expect(reaches().length).toBe(apertureStates(shadow).length);
    expect(reaches().every(({ reach }) => reach === undefined)).toBe(true);
    frames.run(1000 + 0.4 * 250);
    expect(playback.now).toBeCloseTo(0.1, 6);
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, 0.4));
    expect(apertureStates(shadow)).toEqual(referenceApertures(artifact, 0.4));
    expect(reaches().length).toBe(apertureStates(shadow).length);
    expect(reaches().every(({ reach }) => !!reach)).toBe(true);
    frames.run(1000 + 0.9 * 250);
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, 0.9));
    expect(apertureStates(shadow)).toEqual(referenceApertures(artifact, 0.9));
    const ids = Array.from(shadow.querySelectorAll("[id]")).map((e) => e.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => !id.startsWith(artifact.idPrefix))).toBe(true);
  });

  test.each([
    ["3px", /stroke:#fff;stroke-opacity:1;stroke-width:6px/, true],
    ["-1px", /stroke:#000;stroke-opacity:1;stroke-width:2px/, false],
  ])("a moving aperture's stroke follows its clip's `spread = %s`", async (spread, stroke, reached) => {
    const clip = "      between {\n        eyelash-left\n      }";
    expect(SOURCE).toContain(clip);
    const { h, frames, playback } = await previewed(SOURCE.replace(clip, `${clip}\n      spread = ${spread}`));
    await until(() => playback.stats.live === 1, "the artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = (playback as any).layers.values().next().value.images[0].slot.artifact as MorphArtifact;
    frames.run(1000);
    frames.run(1000 + 0.4 * 250);
    const apertures = apertureStates(shadow);
    expect(apertures).toEqual(referenceApertures(artifact, 0.4));
    expect(apertures.length).toBeGreaterThan(0);
    for (const [first] of apertures) {
      expect(first!.style).toMatch(stroke);
      expect(first!.reach !== undefined).toBe(reached);
    }
  });

  test("a shrinking drawing's mask is written and posed between poses and removed at the pose, as the reference renderer draws it", async () => {
    const source = SOURCE.replace(blinkScript(TIMING), blinkScript(`  layers {\n    eyelash-left {\n      spread = -1px\n    }\n  }\n${TIMING}`));
    const { h, frames, playback } = await previewed(source);
    await until(() => playback.stats.live === 1, "the artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const view = (playback as any).layers.values().next().value.images[0].view;
    const artifact = view.artifact as MorphArtifact;
    const masks = Object.values(artifact.spreads ?? {}).flatMap((spread) => (spread.mask ? [spread.mask.split(artifact.idPrefix).join(view.prefix)] : []));
    expect(masks.length).toBeGreaterThan(0);
    const swapped = (offset: number) =>
      Object.fromEntries(Object.entries(referencePaint(artifact, offset)).map(([node, styles]) => [node, styles.map((s) => s.split(artifact.idPrefix).join(view.prefix))]));
    const maskPaths = (root: ParentNode) => masks.map((id) => root.querySelector(`mask[id="${id}"] > path`)?.getAttribute("d") ?? null);
    const markup = maskPaths(shadow);
    expect(markup.every((d) => !!d)).toBe(true);
    frames.run(1000);
    expect(paintStates(shadow)).toEqual(swapped(0));
    expect(Object.values(paintStates(shadow)).flat().some((style) => /mask:/.test(style))).toBe(false);
    frames.run(1000 + 0.15 * 250);
    expect(paintStates(shadow)).toEqual(swapped(0.15));
    expect(apertureStates(shadow)).toEqual(referenceApertures(artifact, 0.15));
    const masked = Array.from(shadow.querySelectorAll("[data-morph]")).filter((e) => /mask:url\(#/.test(e.getAttribute("style") ?? ""));
    expect(masked.map((e) => /mask:url\(#([^)]+)\)/.exec(e.getAttribute("style")!)![1]).sort()).toEqual([...masks].sort());
    for (const element of masked) {
      const id = /mask:url\(#([^)]+)\)/.exec(element.getAttribute("style")!)![1]!;
      expect(shadow.querySelector(`mask[id="${id}"] > path`)!.getAttribute("d")).toBe(element.getAttribute("d"));
    }
    frames.run(1000 + 250);
    expect(paintStates(shadow)).toEqual(swapped(0));
    expect(Object.values(paintStates(shadow)).flat().some((style) => /mask:/.test(style))).toBe(false);
    expect(maskPaths(shadow)).toEqual(markup);
  });

  test("a growing drawing takes a stroke in its fill's paint between poses, as the reference renderer draws it", async () => {
    const source = SOURCE.replace(blinkScript(TIMING), blinkScript(`  layers {\n    eyelash-left {\n      spread = 1px\n    }\n  }\n${TIMING}`));
    const { h, frames, playback } = await previewed(source);
    await until(() => playback.stats.live === 1, "the artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = (playback as any).layers.values().next().value.images[0].slot.artifact as MorphArtifact;
    frames.run(1000);
    expect(paintStates(shadow)).toEqual(referencePaint(artifact, 0));
    expect(Object.values(paintStates(shadow)).flat().some((style) => /stroke-width/.test(style))).toBe(false);
    frames.run(1000 + 0.15 * 250);
    const moving = paintStates(shadow);
    expect(moving).toEqual(referencePaint(artifact, 0.15));
    const grown = Object.values(moving).flat().filter((style) => /stroke-width:2px/.test(style));
    expect(grown.length).toBeGreaterThan(0);
    for (const style of grown) {
      expect(style).toContain("stroke:rgba(17,17,17,1)");
      expect(style).toContain("stroke-linejoin:round");
      expect(style).toContain("vector-effect:non-scaling-stroke");
    }
    frames.run(1000 + 250);
    expect(paintStates(shadow)).toEqual(referencePaint(artifact, 0));
  });

  test("a drawing carried in its partner's shape shows at the held pose as the reference renderer draws it", async () => {
    const source = SOURCE.replace(blinkScript(TIMING), `morph blink {
  method = bend
  layers {
    eyeball-shadow-left { partner = eyelash-left }
  }
  keyframes {
    0% { eyes { state = open } }
    30% { eyes { state = closed } }
    60% { eyes { state = closed } }
    100% { eyes { state = open } }
  }
${TIMING}  clips {
    { between { eyelash-left }; targets { eyeball-white-left; eyeball-shadow-left; pupil-left } }
  }
}
`);
    const files = [{ ...FILES[0]!, data: partnerPortrait() }];
    const { h, frames, playback } = await previewed(source, files);
    await until(() => playback.stats.live === 1, "the artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = (playback as any).layers.values().next().value.images[0].slot.artifact as MorphArtifact;
    const [node, d] = Object.entries(artifact.segments[0]!.carry!.to!)[0]!;
    frames.run(1000);
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, 0));
    expect(leafStates(shadow)[node]![0]!.shown).toBe(true);
    expect(leafStates(shadow)[node]![0]!.d).not.toBe(d);
    frames.run(1000 + 0.45 * 250);
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, 0.45));
    expect(leafStates(shadow)[node]![0]).toEqual({ shown: true, d });
  });

  test("a moving lash takes its blended paint on the live leaf and its markup's paint at the poses", async () => {
    const closed = `d="${CLOSED}" fill="#111"`;
    expect(ART).toContain(closed);
    const files = [{ ...FILES[0]!, data: ART.replace(closed, `d="${CLOSED}" fill="#c9c9c9"`) }];
    const { h, frames, playback } = await previewed(SOURCE, files);
    await until(() => playback.stats.live === 1, "the artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = (playback as any).layers.values().next().value.images[0].slot.artifact as MorphArtifact;
    frames.run(1000);
    expect(paintStates(shadow)).toEqual(referencePaint(artifact, 0));
    expect(Object.values(paintStates(shadow)).flat().every((style) => !/fill/.test(style))).toBe(true);
    frames.run(1000 + 0.15 * 250);
    const moving = paintStates(shadow);
    expect(moving).toEqual(referencePaint(artifact, 0.15));
    const fills = Object.values(moving).flat().map((style) => /fill:([^;]+)/.exec(style)?.[1]).filter(Boolean);
    expect(fills).toHaveLength(2);
    for (const fill of fills) expect(fill).toMatch(/^rgba\((?!17,17,17,)(?!201,201,201,)/);
    frames.run(1000 + 0.6 * 250);
    expect(paintStates(shadow)).toEqual(referencePaint(artifact, 0.6));
    expect(Object.values(paintStates(shadow)).flat().filter((style) => /fill:rgba/.test(style))).toHaveLength(2);
    frames.run(1000 + 250);
    expect(paintStates(shadow)).toEqual(referencePaint(artifact, 0));
    expect(Object.values(paintStates(shadow)).flat().every((style) => !/fill/.test(style))).toBe(true);
  });

  test("a moving lash paints with its own gradient copy, posed every frame and returned to its markup at the poses", async () => {
    const stops = (first: string) => `<stop offset="0" stop-color="${first}"/><stop offset="1" stop-color="#111"/>`;
    const art = ART.replace(
      "</linearGradient></defs>",
      `</linearGradient><linearGradient id="lash-open">${stops("#222")}</linearGradient><linearGradient id="lash-closed">${stops("#ccc")}</linearGradient></defs>`,
    )
      .replace(/(data-name="eyelash-left" d="[^"]*") fill="#111"/g, (whole, start: string) =>
        `${start} fill="url(#${whole.includes(CLOSED) ? "lash-closed" : "lash-open"})"`,
      );
    expect(art).toContain('fill="url(#lash-closed)"');
    expect(art.match(/url\(#lash-open\)/g)).toHaveLength(2);
    const { h, frames, playback } = await previewed(SOURCE, [{ ...FILES[0]!, data: art }]);
    await until(() => playback.stats.live === 1, "the artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const view = (playback as any).layers.values().next().value.images[0].view;
    const artifact = view.artifact as MorphArtifact;
    const copies = [
      ...new Set(
        artifact.segments.flatMap((s) => s.transitions.flatMap((t) => (t.kind === "morph" && t.gradients?.fill ? [t.gradients.fill.id] : []))),
      ),
    ];
    expect(copies).toHaveLength(2);
    const own = (id: string) => id.split(artifact.idPrefix).join(view.prefix);
    const state = (root: ParentNode, id: string) => {
      const element = Array.from(root.querySelectorAll("*")).find((e) => e.localName === "linearGradient" && e.id === id)!;
      const attributes = (e: Element) => Object.fromEntries(Array.from(e.attributes, (a) => [a.name, a.value.split(view.prefix).join(artifact.idPrefix)]));
      return { ...attributes(element), stops: Array.from(element.children).map(attributes) };
    };
    const reference = (offset: number, id: string) => state(new DOMParser().parseFromString(renderMorphAt(artifact, offset), "image/svg+xml"), id);
    const markup = copies.map((id) => state(shadow, own(id)));
    frames.run(1000);
    expect(copies.map((id) => state(shadow, own(id)))).toEqual(copies.map((id) => reference(0, id)));
    expect(Object.values(paintStates(shadow)).flat().every((style) => !/fill/.test(style))).toBe(true);
    frames.run(1000 + 0.15 * 250);
    expect(paintStates(shadow)).toEqual(
      Object.fromEntries(Object.entries(referencePaint(artifact, 0.15)).map(([node, styles]) => [node, styles.map((s) => s.split(artifact.idPrefix).join(view.prefix))])),
    );
    const fills = Object.values(paintStates(shadow)).flat().map((style) => /fill:([^;]+)/.exec(style)?.[1]).filter(Boolean);
    expect(fills.sort()).toEqual(copies.map((id) => `url(#${own(id)})`).sort());
    for (const id of copies) {
      const posed = state(shadow, own(id));
      expect(posed).toEqual(reference(0.15, id));
      expect(posed).not.toEqual(markup[copies.indexOf(id)]);
    }
    frames.run(1000 + 250);
    expect(copies.map((id) => state(shadow, own(id)))).toEqual(markup);
    expect(Object.values(paintStates(shadow)).flat().every((style) => !/fill/.test(style))).toBe(true);
  });

  test("an aperture with a closed loop strokes its open loops alone at rest, and every path follows the frames away from it", async () => {
    expect(WINK_SOURCE).toContain("eyelash-right");
    expect(WINK_SOURCE).toContain("eyeball-white-right");
    const { h, frames, playback } = await previewed(WINK_SOURCE, WINK_FILES);
    await until(() => playback.stats.live === 1, "the artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = (playback as any).layers.values().next().value.images[0].slot.artifact as MorphArtifact;
    frames.run(1000);
    const rest = apertureStates(shadow);
    expect(rest).toEqual(referenceApertures(artifact, 0));
    expect(rest.length).toBeGreaterThan(0);
    for (const [all, open] of rest) {
      expect(all!.style).toMatch(/stroke:none/);
      expect(open!.style).toMatch(/stroke-width:2px/);
      expect(open!.d).not.toBe(all!.d);
    }
    frames.run(1000 + 0.4 * 250);
    const moving = apertureStates(shadow);
    expect(moving).toEqual(referenceApertures(artifact, 0.4));
    for (const paths of moving) {
      expect(paths).toHaveLength(2);
      expect(paths[1]!.d).toBe(paths[0]!.d);
      expect(paths[1]!.style).toMatch(/stroke:\s*none/);
      if (paths[0]!.reach !== undefined) expect(paths[0]!.style).toMatch(/stroke-width:2px/);
      else expect(paths[0]!.style).toMatch(/stroke:\s*none/);
    }
    expect(moving.filter((paths) => paths[0]!.reach).length).toBe(1);
    frames.run(1000 + 250);
    expect(apertureStates(shadow)).toEqual(rest);
  });

  test("pause freezes the exact frame; the preference returns to rest and starts a fresh cycle", async () => {
    const { h, playback } = await previewed();
    await until(() => playback.stats.live === 1, "the artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = (playback as any).layers.values().next().value.images[0].slot.artifact as MorphArtifact;
    const rest = leafStates(shadow);
    playback.advance(0.6 * 0.25);
    const frozen = leafStates(shadow);
    expect(frozen).toEqual(referenceStates(artifact, 0.6));
    playback.setPaused(true);
    playback.advance(0.1);
    expect(leafStates(shadow)).toEqual(frozen);
    playback.setEnabled(false);
    expect(leafStates(shadow)).toEqual(rest);
    playback.setPaused(false);
    playback.advance(0.1);
    expect(leafStates(shadow)).toEqual(rest);
    playback.setEnabled(true);
    playback.advance(0.2 * 0.25);
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, 0.2));
  });

  test("a live-preview re-render of the same place keeps the phase; another place starts at rest", async () => {
    const { h, playback } = await previewed();
    await until(() => playback.stats.live === 1, "the artifact");
    const line = lineOf(SOURCE, "First line.");
    playback.setSession(`preview:main:${line}`);
    playback.advance(0.3 * 0.25);
    const keys = playback.occurrenceKeys;
    const before = (playback as any).occurrences.get(keys[0]).start;
    await h.rerender(SOURCE.replace("Second line.", "Second line, edited."), line);
    playback.setSession(`preview:main:${line}`);
    expect(playback.occurrenceKeys).toEqual(keys);
    expect((playback as any).occurrences.get(keys[0]).start).toBe(before);
    expect(playback.stats.layers).toBe(1);
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = (playback as any).layers.values().next().value.images[0].slot.artifact as MorphArtifact;
    playback.advance(0.1 * 0.25);
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, 0.4));
    playback.setSession(`preview:main:${line + 1}`);
    expect((playback as any).occurrences.get(keys[0]).start).toBe(playback.now);
  });

  test("clearing the portrait lets go of every layer and occurrence; repeated writes do not accumulate", async () => {
    const { h, playback } = await previewed();
    await until(() => playback.stats.live === 1, "the artifact");
    for (let i = 0; i < 3; i++) {
      await h.game.module.ui.image.write("portrait", [{ control: "show", assets: ["bunny"] } as any], true);
      await flushMicrotasks(10);
    }
    await until(() => playback.stats.live === 1, "the rewritten artifact");
    expect(playback.stats.layers).toBe(1);
    expect(playback.stats.occurrences).toBe(1);
    expect(h.overlay.querySelectorAll("span.morph").length).toBe(1);
    await h.game.module.ui.image.clear("portrait");
    await flushMicrotasks(10);
    expect(playback.stats).toEqual({ layers: 0, live: 0, occurrences: 0 });
  });

  test("a portrait's drawing and its outline masks appear together, once every mask's image has decoded", async () => {
    const source = `${SOURCE}
layout main {
  stage {
    portrait {
      mask.outline
      mask.rim
      image
    }
  }
}
`;
    const h = createDOMHarness(source, 0, { files: FILES });
    const view = h.overlay.ownerDocument.defaultView as any;
    const decodes: { crossOrigin: string | null; src: string; done: () => void }[] = [];
    const Image = view.Image;
    view.Image = class {
      crossOrigin: string | null = null;
      src = "";
      decode() {
        return new Promise<void>((resolve) => decodes.push({ crossOrigin: this.crossOrigin, src: this.src, done: resolve }));
      }
    };
    try {
      const program = () => h.game.program;
      const playback = MorphPlayback.for(h.overlay);
      playback.configure({
        host: createMorphHost({
          service: new MorphBakeService({ createObjectURL: () => "blob:rest", revokeObjectURL: () => {} }),
          channel: () => program().morphs,
          readSource: inlineMorphSource(() => program().context),
        }),
        seed: "test",
        ...manualFrames(),
      });
      await h.ready;
      await h.preview(lineOf(source, "First line."));
      const drawing = () => h.overlay.querySelector(".portrait > .image > .instance") as HTMLElement | null;
      const outlines = () => ["outline", "rim"].map((name) => h.overlay.querySelector(`.portrait > .mask.${name} > .instance`) as HTMLElement);
      const masked = () => outlines().map((el) => el.style.getPropertyValue("mask-image").includes("blob:rest"));
      await until(() => decodes.length > 0 || !!drawing()?.querySelector("span.morph"), "the artifact");
      await flushMicrotasks(10);
      expect(drawing()!.querySelector("span.morph")).toBeNull();
      expect(masked()).toEqual([false, false]);
      expect(decodes.map(({ crossOrigin, src }) => ({ crossOrigin, src }))).toEqual([
        { crossOrigin: "anonymous", src: "blob:rest" },
        { crossOrigin: "anonymous", src: "blob:rest" },
      ]);
      decodes[0]!.done();
      await flushMicrotasks(10);
      expect(drawing()!.querySelector("span.morph")).toBeNull();
      expect(masked()).toEqual([false, false]);
      decodes[1]!.done();
      await until(() => !!drawing()?.querySelector("span.morph"), "the drawing");
      expect(masked()).toEqual([true, true]);
    } finally {
      view.Image = Image;
    }
  });
});

describe("morph layers", () => {
  const recipeText = serializeMorphRecipe(blink());
  const ref = (key: string, image = "bunny"): MorphRef => ({ morphs: ["blink"], key, image, selection: "{}", groups: ["eyes"] });
  const timing: MorphTiming = { duration: 0.25, delay: 0, easing: "linear", iterations: "infinite", direction: "normal" };
  const BG = 'url("bunny.svg")';
  const content = (overrides: Partial<MorphImageContent["plays"][number]> = {}, epoch = 0): MorphImageContent => ({
    plays: [{ layer: 0, ref: ref("k1"), morph: "blink", timing, definition: "d1", ...overrides }],
    epoch,
  });

  function setup(host?: MorphHost) {
    const env = installJSDOM();
    restore = env.restore;
    const bake = host ?? createMorphHost({
      service: new MorphBakeService({ createObjectURL: () => "blob:rest", revokeObjectURL: () => {} }),
      channel: () => ({ recipes: { blink: recipeText }, variants: {} }),
      readSource: async () => ({ text: ART }),
    });
    const playback = new MorphPlayback(env.overlay, { host: bake, seed: "s", requestFrame: () => 0, cancelFrame: () => {} });
    const span = () => {
      const el = env.overlay.ownerDocument.createElement("span");
      env.overlay.appendChild(el);
      return el;
    };
    return { playback, span, overlay: env.overlay };
  }

  test("a compatible drawing of the same occurrence keeps its phase while the outgoing one freezes", async () => {
    const { playback, span } = setup();
    const first = span();
    playback.mount(first, content(), BG, "background", "portrait:0");
    await until(() => playback.stats.live === 1, "the first artifact");
    playback.advance(0.1);
    const second = span();
    playback.mount(second, content({ ref: ref("k2") }), BG, "background", "portrait:0");
    playback.freezeWithin(first);
    expect(playback.occurrenceKeys).toHaveLength(1);
    const occurrence = (playback as any).occurrences.get(playback.occurrenceKeys[0]);
    expect(occurrence.start).toBe(0);
    await until(() => playback.stats.live === 1 && !!second.querySelector("span.morph"), "the second artifact");
    const frozen = leafStates(shadowOf(first)!);
    playback.advance(0.05);
    expect(leafStates(shadowOf(first)!)).toEqual(frozen);
    playback.releaseWithin(first);
    expect(playback.stats.layers).toBe(1);
  });

  test("a different character, a new epoch or an edited definition is a new occurrence at rest", () => {
    const { playback, span } = setup();
    const keys = (c: MorphImageContent) => playback.mount(span(), c, BG, "background", "portrait:0").occurrenceKeys[0];
    const base = keys(content());
    expect(keys(content({ ref: ref("k3", "raffles") }))).not.toBe(base);
    expect(keys(content({}, 1))).not.toBe(base);
    expect(keys(content({ definition: "d2" }))).not.toBe(base);
    expect(keys(content())).toBe(base);
    expect(playback.mount(span(), content(), BG, "background", "backdrop:0").occurrenceKeys[0]).not.toBe(base);
  });

  test.each([
    ["a character's at-sign drawings keep the morph's place", ["mia@night", "mia"], ["mia@day", "mia"], 0.4],
    ["at-sign drawings of an image no character owns keep the morph's place", ["stranger@a", undefined], ["stranger@b", undefined], 0.4],
    ["another character on the same target starts the morph again", ["mia@night", "mia"], ["mia@night", "bob"], 0],
  ] as const)("%s", (_label, [fromImage, fromOwner], [toImage, toOwner], offset) => {
    const { playback, span } = setup();
    const look = (image: string, owner: string | undefined) => content({ ref: ref(`${image}|${owner}`, image), ...(owner ? { owner } : {}) });
    const occurrenceOf = (layer: any) => (playback as any).occurrences.get(layer.occurrenceKeys[0]);
    const first = span();
    const outgoing = playback.mount(first, look(fromImage, fromOwner), BG, "background", "portrait:0");
    playback.advance(0.1);
    expect(playback.playhead(occurrenceOf(outgoing))).toEqual({ phase: "playing", play: 0, offset: expect.closeTo(0.4, 9) });
    const incoming = playback.mount(span(), look(toImage, toOwner), BG, "background", "portrait:0");
    playback.freezeWithin(first);
    expect(playback.playhead(occurrenceOf(incoming))).toEqual({ phase: "playing", play: 0, offset: expect.closeTo(offset, 9) });
  });

  test("a pending or failed artifact leaves the static image in place", async () => {
    const never: MorphHost = { resolve: () => new Promise(() => {}) };
    const pending = setup(never);
    const a = pending.span();
    a.style.backgroundImage = 'url("bunny.svg")';
    pending.playback.mount(a, content(), BG, "background", "portrait:0");
    await flushMicrotasks(10);
    expect(a.querySelector("span.morph")).toBeNull();
    expect(a.style.backgroundImage).toContain("bunny.svg");
    restore?.();
    const failing: MorphHost = { resolve: () => Promise.reject(new Error("no source")) };
    const failed = setup(failing);
    const b = failed.span();
    b.style.backgroundImage = 'url("bunny.svg")';
    const layer = failed.playback.mount(b, content(), BG, "background", "portrait:0");
    await flushMicrotasks(10);
    expect((layer as any).images[0].slot.state).toBe("failed");
    expect(b.querySelector("span.morph")).toBeNull();
    expect(b.style.backgroundImage).toContain("bunny.svg");
  });

  test("a mask shows the artifact's static rest render", async () => {
    const { playback, span } = setup();
    const mask = span();
    playback.mount(mask, { ...content(), plays: [{ ...content().plays[0]!, layer: 1 }] }, 'url("bunny.svg"), url("under.svg")', "mask", "portrait:mask:0");
    await until(() => mask.style.getPropertyValue("mask-image") !== "", "the rest render");
    expect(mask.style.getPropertyValue("mask-image")).toBe('url("blob:rest"), url("under.svg")');
    expect(mask.querySelector("span.morph")).toBeNull();
    expect(playback.occurrenceKeys).toEqual([]);
  });

  test("a preemption holds the occurrence at rest and its schedule resumes where it stopped", async () => {
    const { playback, span } = setup();
    const el = span();
    playback.mount(el, content(), BG, "background", "portrait:0");
    await until(() => playback.stats.live === 1, "the artifact");
    const key = playback.occurrenceKeys[0]!;
    const rest = leafStates(shadowOf(el)!);
    playback.advance(0.1);
    const moving = leafStates(shadowOf(el)!);
    const resume = playback.preempt(key);
    expect(leafStates(shadowOf(el)!)).toEqual(rest);
    playback.advance(1);
    expect(leafStates(shadowOf(el)!)).toEqual(rest);
    resume();
    expect(leafStates(shadowOf(el)!)).toEqual(moving);
  });
});

describe("morph lifecycle at the page's boundaries", () => {
  const recipeText = serializeMorphRecipe(blink());
  const ref: MorphRef = { morphs: ["blink"], key: "k1", image: "bunny", selection: "{}", groups: ["eyes"] };
  const timing: MorphTiming = { duration: 0.25, delay: 0.7, easing: "linear", iterations: "infinite", direction: "normal" };
  const content: MorphImageContent = { plays: [{ layer: 0, ref, morph: "blink", timing, definition: "d1" }], epoch: 0 };
  const BG = 'url("bunny.svg")';
  const bakingHost = () =>
    createMorphHost({
      service: new MorphBakeService(),
      channel: () => ({ recipes: { blink: recipeText }, variants: {} }),
      readSource: async () => ({ text: ART }),
    });

  test("a portrait mounted after the frame loop went idle starts from its own first frame", async () => {
    const env = installJSDOM();
    restore = env.restore;
    const frames = manualFrames();
    const playback = new MorphPlayback(env.overlay, { host: bakingHost(), seed: "s", ...frames });
    const doc = env.overlay.ownerDocument;
    const first = doc.createElement("span");
    env.overlay.appendChild(first);
    playback.mount(first, content, BG, "background", "portrait:0");
    await until(() => playback.stats.live === 1, "the first artifact");
    frames.run(1000);
    frames.run(1200);
    playback.releaseWithin(first);
    first.remove();
    frames.run(1300);
    expect(frames.pending).toBe(0);
    const before = playback.now;
    const second = doc.createElement("span");
    env.overlay.appendChild(second);
    playback.mount(second, content, BG, "background", "portrait:1");
    await until(() => playback.stats.live === 1, "the second artifact");
    frames.run(10_000);
    expect(playback.now).toBe(before);
    frames.run(10_100);
    expect(playback.now).toBeCloseTo(before + 0.1, 9);
  });

  test("content written over an element lets go of the morphs drawn inside it", async () => {
    const env = installJSDOM();
    restore = env.restore;
    let aborted = false;
    const pending: MorphHost = {
      resolve: (_ref, options) =>
        new Promise(() => {
          options?.signal?.addEventListener("abort", () => (aborted = true));
        }),
    };
    const playback = new MorphPlayback(env.overlay, { host: pending, requestFrame: () => 0, cancelFrame: () => {} });
    (env.overlay as any).__sdMorphs = playback;
    playback.setEnabled(false);
    const ui = new UIManager(createStubApp(env.overlay, () => {}));
    const doc = env.overlay.ownerDocument;
    const box = doc.createElement("div");
    (box as any).__sdId = "box";
    env.overlay.appendChild(box);
    const span = doc.createElement("span");
    box.appendChild(span);
    playback.mount(span, content, BG, "background", "box:0");
    expect(playback.stats.layers).toBe(1);
    await ui.onReceiveRequest(UpdateElementMessage.type.request({ element: "box", content: { text: "Replaced." } } as any));
    expect(playback.stats.layers).toBe(0);
    expect(aborted).toBe(true);
  });
});

describe("live drawing presentation", () => {
  const recipeText = serializeMorphRecipe(blink());
  const ref: MorphRef = { morphs: ["blink"], key: "k1", image: "bunny", selection: "{}", groups: ["eyes"] };
  const timing: MorphTiming = { duration: 0.25, delay: 0, easing: "linear", iterations: "infinite", direction: "normal" };
  const content: MorphImageContent = { plays: [{ layer: 0, ref, morph: "blink", timing, definition: "d1" }], epoch: 0 };

  test("a style change that moves the image moves the live drawing with it, without a resize", async () => {
    const env = installJSDOM();
    restore = env.restore;
    const host = createMorphHost({
      service: new MorphBakeService(),
      channel: () => ({ recipes: { blink: recipeText }, variants: {} }),
      readSource: async () => ({ text: ART }),
    });
    const playback = new MorphPlayback(env.overlay, { host, requestFrame: () => 0, cancelFrame: () => {} });
    (env.overlay as any).__sdMorphs = playback;
    const ui = new UIManager(createStubApp(env.overlay, () => {}));
    const doc = env.overlay.ownerDocument;
    const other = doc.createElement("div");
    (other as any).__sdId = "other";
    env.overlay.appendChild(other);
    const span = doc.createElement("span");
    span.setAttribute("style", "width:400px;height:300px;background-repeat:no-repeat;background-position:0% 0%");
    env.overlay.appendChild(span);
    playback.mount(span, content, 'url("bunny.svg")', "background", "portrait:0");
    await until(() => playback.stats.live === 1, "the artifact");
    const box = () => {
      const part = span.querySelector(":scope > span.morph")!.shadowRoot!.querySelector("div > svg > svg")!;
      return [part.getAttribute("x"), part.getAttribute("y")];
    };
    expect(box()).toEqual(["0", "0"]);
    span.style.backgroundPosition = "100% 100%";
    await ui.onReceiveRequest(UpdateElementMessage.type.request({ element: "other", style: { opacity: "1" } } as any));
    await flushMicrotasks(5);
    expect(box()).toEqual(["140", "160"]);
  });

  test("the live drawing at rest fills the static image's exact fractional rectangle", async () => {
    const env = installJSDOM();
    restore = env.restore;
    const host = createMorphHost({
      service: new MorphBakeService(),
      channel: () => ({ recipes: { blink: recipeText }, variants: {} }),
      readSource: async () => ({ text: ART }),
    });
    const playback = new MorphPlayback(env.overlay, { host, requestFrame: () => 0, cancelFrame: () => {} });
    const doc = env.overlay.ownerDocument;
    const span = doc.createElement("span");
    span.setAttribute(
      "style",
      "width:401px;height:100.5px;background-repeat:no-repeat;background-size:auto 100%;background-position:50% 50%",
    );
    env.overlay.appendChild(span);
    playback.mount(span, content, 'url("bunny.svg")', "background", "portrait:0");
    await until(() => playback.stats.live === 1, "the artifact");
    const b = span.querySelector(":scope > span.morph")!.shadowRoot!.querySelector("div") as HTMLElement;
    expect(b.getAttribute("style")).toBe("position:absolute;left:0;top:0;width:100%;height:100%");
    const width = (100.5 * 260) / 140;
    const parts = Array.from(b.querySelectorAll(":scope > svg > svg"));
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(Number(part.getAttribute("x"))).toBeCloseTo((401 - width) / 2, 6);
      expect(part.getAttribute("y")).toBe("0");
      expect(Number(part.getAttribute("width"))).toBeCloseTo(width, 6);
      expect(part.getAttribute("height")).toBe("100.5");
    }
  });

  test("a style change that makes the image repeat hands it back to CSS, and back again", async () => {
    const env = installJSDOM();
    restore = env.restore;
    const host = createMorphHost({
      service: new MorphBakeService(),
      channel: () => ({ recipes: { blink: recipeText }, variants: {} }),
      readSource: async () => ({ text: ART }),
    });
    const playback = new MorphPlayback(env.overlay, { host, requestFrame: () => 0, cancelFrame: () => {} });
    (env.overlay as any).__sdMorphs = playback;
    const ui = new UIManager(createStubApp(env.overlay, () => {}));
    const doc = env.overlay.ownerDocument;
    const other = doc.createElement("div");
    (other as any).__sdId = "other";
    env.overlay.appendChild(other);
    const span = doc.createElement("span");
    span.setAttribute("style", "width:400px;height:300px;background-repeat:no-repeat");
    env.overlay.appendChild(span);
    playback.mount(span, content, 'url("bunny.svg")', "background", "portrait:0");
    await until(() => playback.stats.live === 1, "the artifact");
    const op = async () => {
      await ui.onReceiveRequest(UpdateElementMessage.type.request({ element: "other", style: { opacity: "1" } } as any));
      await flushMicrotasks(5);
    };
    span.style.backgroundRepeat = "repeat";
    await op();
    const shadow = span.querySelector(":scope > span.morph")!.shadowRoot!;
    expect(playback.stats.live).toBe(0);
    expect(shadow.querySelectorAll("[data-morph]")).toHaveLength(0);
    expect(shadow.querySelector("div")!.getAttribute("style")).toContain("background-repeat:repeat");
    span.style.backgroundRepeat = "no-repeat";
    await op();
    expect(playback.stats.live).toBe(1);
    expect(shadow.querySelectorAll("[data-morph]").length).toBeGreaterThan(0);
  });

  test("an inline artifact the page let go is asked for again when a layer needs it", async () => {
    const env = installJSDOM();
    restore = env.restore;
    const baked = await createMorphHost({
      service: new MorphBakeService(),
      channel: () => ({ recipes: { blink: recipeText }, variants: {} }),
      readSource: async () => ({ text: ART }),
    }).resolve(ref);
    const artifactFor = (key: string) => ({ ...structuredClone(baked.artifact), key });
    const playback = new MorphPlayback(env.overlay, { requestFrame: () => 0, cancelFrame: () => {} });
    const asked: string[] = [];
    playback.askGame = (key) => {
      asked.push(key);
      playback.deliver({ key, artifact: artifactFor(key) });
    };
    const artifact = artifactFor("k");
    for (let i = 0; i < 1100; i++) playback.deliver({ key: `k${i}`, artifact: { ...artifact, key: `k${i}` } });
    const span = env.overlay.ownerDocument.createElement("span");
    env.overlay.appendChild(span);
    playback.mount(span, { ...content, plays: [{ ...content.plays[0]!, ref: { ...ref, key: "k0" } }] }, 'url("bunny.svg")', "background", "portrait:0");
    await until(() => playback.stats.live === 1, "the artifact asked for again");
    expect(asked).toEqual(["k0"]);
    const other = env.overlay.ownerDocument.createElement("span");
    env.overlay.appendChild(other);
    playback.mount(other, { ...content, plays: [{ ...content.plays[0]!, ref: { ...ref, key: "k1099" } }] }, 'url("bunny.svg")', "background", "portrait:1");
    await until(() => playback.stats.live === 2, "the held artifact");
    expect(asked).toEqual(["k0"]);
  });

  test("a part's markup is made inert: no scripts, embedded documents, handlers or javascript links", async () => {
    const env = installJSDOM();
    restore = env.restore;
    const baked = await createMorphHost({
      service: new MorphBakeService(),
      channel: () => ({ recipes: { blink: recipeText }, variants: {} }),
      readSource: async () => ({ text: ART }),
    }).resolve(ref);
    const artifact = structuredClone(baked.artifact);
    const live = artifact.parts.findIndex((p) => p.kind === "live");
    artifact.parts[live]!.svg = artifact.parts[live]!.svg
      .replace("<svg ", `<svg onload="window.__ran = 1" `)
      .replace(/(<svg[^>]*>)/, `$1<script>window.__ran = 2</script><a href="javascript:alert(1)"><rect width="1" height="1" onclick="x()"/></a><a href="java&#x09;script:alert(2)"><rect width="1" height="1"/></a><foreignObject><iframe src="about:blank"></iframe></foreignObject>`);
    const service = new MorphBakeService();
    const host: MorphHost = { resolve: (r, o) => service.request(r.key, async () => ({ kind: "artifact", artifact }), o) };
    const playback = new MorphPlayback(env.overlay, { host, requestFrame: () => 0, cancelFrame: () => {} });
    const span = env.overlay.ownerDocument.createElement("span");
    env.overlay.appendChild(span);
    playback.mount(span, content, 'url("bunny.svg")', "background", "portrait:0");
    await until(() => playback.stats.live === 1, "the artifact");
    const shadow = shadowOf(span)!;
    expect(shadow.querySelectorAll("script, iframe, object, embed")).toHaveLength(0);
    const attributes = Array.from(shadow.querySelectorAll("*")).flatMap((e) => Array.from(e.attributes));
    expect(attributes.filter((a) => a.name.toLowerCase().startsWith("on"))).toEqual([]);
    expect(attributes.filter((a) => /javascript:/i.test(a.value.replace(/\s/g, "")))).toEqual([]);
    expect(shadow.querySelectorAll("[data-morph]").length).toBeGreaterThan(0);
  });
});

describe("background fit", () => {
  const art = svgIntrinsicSize({ viewBox: "0 0 260 140", width: "260", height: "140" });
  const area = { width: 400, height: 300 };

  test("the portrait default, `auto 100%` centred, follows the art's ratio at the area's height", () => {
    const rect = backgroundRect(area, art, "auto 100%", "50% 50%")!;
    expect(rect.height).toBe(300);
    expect(rect.width).toBeCloseTo((300 * 260) / 140, 9);
    expect(rect.x).toBeCloseTo((400 - rect.width) / 2, 9);
    expect(rect.y).toBe(0);
  });

  test("contain, cover and auto size as CSS does", () => {
    expect(backgroundRect(area, art, "contain", "0% 0%")).toMatchObject({ width: 400, height: (400 * 140) / 260 });
    expect(backgroundRect(area, art, "cover", "0% 0%")).toMatchObject({ height: 300, width: (300 * 260) / 140 });
    expect(backgroundRect(area, art, "auto", "0% 0%")).toMatchObject({ width: 260, height: 140 });
    const ratioOnly = svgIntrinsicSize({ viewBox: "0 0 260 140", width: "100%", height: "100%" });
    expect(backgroundRect(area, ratioOnly, "auto", "0% 0%")).toMatchObject({ width: 400 });
    expect(backgroundRect(area, art, "50% auto", "0% 0%")).toMatchObject({ width: 200, height: (200 * 140) / 260 });
  });

  test("positions read percentages, lengths, calc() and edge offsets", () => {
    const at = (position: string) => {
      const r = backgroundRect(area, art, "auto", position)!;
      return [r.x, r.y];
    };
    expect(at("100% 100%")).toEqual([140, 160]);
    expect(at("10px 20px")).toEqual([10, 20]);
    expect(at("calc(100% - 10px) 50%")).toEqual([130, 80]);
    expect(at("right 10px bottom 20px")).toEqual([130, 140]);
    expect(at("center")).toEqual([70, 80]);
    expect(at("top left")).toEqual([0, 0]);
    expect(backgroundRect(area, art, "auto", "anchor(--x)")).toBeUndefined();
  });

  test("a computed list repeats for layers it does not list", () => {
    expect(layerValue("auto 100%, cover", 1)).toBe("cover");
    expect(layerValue("auto 100%", 3)).toBe("auto 100%");
    expect(layerValue("calc(100% - 1px) 0%, 0% 0%", 0)).toBe("calc(100% - 1px) 0%");
  });
});

describe("two morphs on one portrait", () => {
  const TALK_TIMING = `  timing {
    duration = 0.4
    easing = linear
    iterations = infinite
  }
`;
  const PAIR_SOURCE = `${blinkScript(TIMING)}
${talkScript(TALK_TIMING)}


scene start
  HERO:
    [[show portrait bunny]]
    First line.
end
`;
  const PAIR_FILES = [{ uri: "inmemory:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: talkingPortrait({ dx: 0, dy: 0 }) }];

  async function paired() {
    const h = createDOMHarness(PAIR_SOURCE, 0, { files: PAIR_FILES });
    const frames = manualFrames();
    const playback = MorphPlayback.for(h.overlay);
    playback.configure({ host: inProcessHost(() => h.game.program), seed: "test", ...frames });
    await h.ready;
    await h.preview(lineOf(PAIR_SOURCE, "First line."));
    await flushMicrotasks(10);
    await until(() => playback.stats.live === 1, "the shared artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = (playback as any).layers.values().next().value.images[0].slot.artifact as MorphArtifact;
    return { h, frames, playback, shadow, artifact };
  }

  const offsetsOf = (playback: MorphPlayback, expected: Record<string, number>) => {
    const offsets: Record<string, number> = {};
    for (const occurrence of (playback as any).occurrences.values()) {
      const head = playback.playhead(occurrence);
      if ("offset" in head) offsets[occurrence.key.split("|")[3]] = head.offset;
    }
    expect(Object.keys(offsets).sort()).toEqual(Object.keys(expected).sort());
    for (const [morph, offset] of Object.entries(expected)) expect(offsets[morph]).toBeCloseTo(offset, 9);
    return offsets;
  };

  test("each morph keeps its own occurrence and advances on its own clock in one drawing", async () => {
    const { frames, playback, shadow, artifact } = await paired();
    expect(artifact.morphs).toEqual(["blink", "talk"]);
    expect(shadow.querySelectorAll("svg > svg").length).toBeGreaterThan(1);
    expect(playback.occurrenceKeys).toHaveLength(2);
    expect(playback.occurrenceKeys.map((key) => key.split("|")[3])).toEqual(["blink", "talk"]);
    frames.run(1000);
    frames.run(1000 + 100);
    expect(playback.now).toBeCloseTo(0.1, 6);
    const both = offsetsOf(playback, { blink: 0.4, talk: 0.25 });
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, both));
    expect(apertureStates(shadow)).toEqual(referenceApertures(artifact, both));
    expect(leafStates(shadow)).not.toEqual(referenceStates(artifact, 0.4));
    expect(leafStates(shadow)).not.toEqual(referenceStates(artifact, { blink: 0.4 }));
    expect(leafStates(shadow)).not.toEqual(referenceStates(artifact, { talk: 0.25 }));
  });

  test("pausing freezes both morphs, and `Animate portraits` off returns both to rest", async () => {
    const { playback, shadow, artifact } = await paired();
    const rest = leafStates(shadow);
    playback.advance(0.15);
    const frozen = leafStates(shadow);
    expect(frozen).toEqual(referenceStates(artifact, offsetsOf(playback, { blink: 0.6, talk: 0.375 })));
    playback.setPaused(true);
    playback.advance(0.1);
    expect(leafStates(shadow)).toEqual(frozen);
    playback.setEnabled(false);
    expect(leafStates(shadow)).toEqual(rest);
    playback.setPaused(false);
    playback.advance(0.1);
    expect(leafStates(shadow)).toEqual(rest);
    playback.setEnabled(true);
    playback.advance(0.05);
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, offsetsOf(playback, { blink: 0.2, talk: 0.125 })));
  });

  test("a new session starts every occurrence of the portrait again at rest", async () => {
    const { playback, shadow, artifact } = await paired();
    const rest = leafStates(shadow);
    playback.advance(0.15);
    expect(leafStates(shadow)).not.toEqual(rest);
    playback.setSession("another");
    expect(leafStates(shadow)).toEqual(rest);
    playback.advance(0.05);
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, offsetsOf(playback, { blink: 0.2, talk: 0.125 })));
  });
});

describe("a speech morph beside a blink", () => {
  const SPEECH_TIMING = `  timing {
    trigger = speech
    duration = 0.4
    easing = linear
  }
`;
  const scene = `

scene start
  HERO:
    [[show portrait bunny]]
    First line.
end
`;
  const rows: [string, string][] = [
    ["a speech morph", `${blinkScript(TIMING)}\n${talkScript(SPEECH_TIMING)}${scene}`],
    [
      "a child of a speech morph",
      `${blinkScript(TIMING)}\n${talkScript(`  when = eyes.closed\n${SPEECH_TIMING}`, "speaking")}\nmorph talk as speaking {\n  when = eyes.open\n}\n${scene}`,
    ],
  ];
  const files = [{ uri: "inmemory:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: talkingPortrait({ dx: 0, dy: 0 }) }];

  test.each(rows)("%s stays at rest as time advances while the blink keeps playing", async (_label, source) => {
    const h = createDOMHarness(source, 0, { files });
    const frames = manualFrames();
    const playback = MorphPlayback.for(h.overlay);
    playback.configure({ host: inProcessHost(() => h.game.program), seed: "test", ...frames });
    await h.ready;
    await h.preview(lineOf(source, "First line."));
    await flushMicrotasks(10);
    await until(() => playback.stats.live === 1, "the shared artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = (playback as any).layers.values().next().value.images[0].slot.artifact as MorphArtifact;
    expect(artifact.morphs).toEqual(["blink", "talk"]);
    expect(playback.occurrenceKeys.map((key) => key.split("|")[3])).toEqual(["blink", "talk"]);
    const rest = leafStates(shadow);
    expect(rest).toEqual(referenceStates(artifact, {}));
    for (const [step, blinkAt] of [
      [0.1, 0.4],
      [0.1, 0.8],
      [0.15, 0.4],
      [1.05, 0.6],
    ] as const) {
      playback.advance(step);
      const heads = new Map(
        [...(playback as any).occurrences.values()].map((occurrence: any) => [occurrence.key.split("|")[3], playback.playhead(occurrence)]),
      );
      expect(heads.get("talk")).toEqual({ phase: "off" });
      const blinkHead = heads.get("blink") as { offset: number };
      expect(blinkHead.offset).toBeCloseTo(blinkAt, 9);
      expect(leafStates(shadow)).toEqual(referenceStates(artifact, { blink: blinkHead.offset }));
      expect(leafStates(shadow)).not.toEqual(rest);
    }
  });
});

describe("a speech morph while its character speaks (#2111)", () => {
  const SPEECH_TIMING = `  timing {
    trigger = speech
    duration = 0.1
    easing = linear
  }
`;
  const CHARACTERS = `define mia as character with
  name = "MIA"
end

define bunny as character with
  name = "BUNNY"
end
`;
  const scene = (backdrop: string) => `

scene start
  MIA:
    [[show portrait mia]]
    [[show backdrop ${backdrop}]]
    First line.
end
`;
  const art = (name: string) => ({ uri: `inmemory:///${name}.svg`, type: "image", name, ext: "svg", data: talkingPortrait({ dx: 0, dy: 0 }) });
  const files = [art("mia"), art("mia@night"), art("bunny")];
  const speechMorphs: [string, string][] = [
    ["a speech morph", talkScript(SPEECH_TIMING)],
    ["a child of a speech morph", `${talkScript(`  when = eyes.closed\n${SPEECH_TIMING}`, "speaking")}\nmorph talk as speaking {\n  when = eyes.open\n}\n`],
  ];

  async function speaking(backdrop = "bunny", morphs = speechMorphs[0]![1]) {
    const source = `${CHARACTERS}\n${morphs}${scene(backdrop)}`;
    const h = createDOMHarness(source, 0, { files });
    const playback = MorphPlayback.for(h.overlay);
    playback.configure({ host: inProcessHost(() => h.game.program), seed: "test", ...manualFrames() });
    await h.ready;
    await h.preview(lineOf(source, "First line."));
    await flushMicrotasks(10);
    await until(() => playback.stats.live === 2, "both portraits' artifacts");
    const heads = () =>
      new Map(
        [...(playback as any).layers].flatMap((layer: any) =>
          layer.images.flatMap((image: any) =>
            image.plays.filter((p: any) => p.occurrence).map((p: any) => [`${p.play.ref.image}:${p.play.morph}`, playback.playhead(p.occurrence)]),
          ),
        ),
      );
    const head = (image: string) => heads().get(`${image}:talk`);
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = [...(playback as any).layers]
      .flatMap((layer: any) => layer.images)
      .find((image: any) => image.plays[0].play.ref.image === "mia").slot.artifact as MorphArtifact;
    return { h, playback, head, shadow, artifact, rest: leafStates(shadow) };
  }

  const playing = (offset: number) => ({ phase: "playing", play: expect.any(Number), offset: expect.closeTo(offset, 9) });

  test.each(speechMorphs)("%s plays only inside a span, finishes the play in progress and starts none after it", async (_label, morphs) => {
    const { playback, head, shadow, artifact, rest } = await speaking("bunny", morphs);
    expect(head("mia")).toEqual({ phase: "off" });
    playback.speak("mia", [[0.2, 0.45]]);
    for (const [step, expected] of [
      [0.1, { phase: "off" }],
      [0.15, playing(0.5)],
      [0.1, playing(0.5)],
      [0.07, playing(0.2)],
      [0.05, playing(0.7)],
      [0.08, { phase: "off" }],
      [1, { phase: "off" }],
    ] as const) {
      playback.advance(step);
      expect(head("mia")).toEqual(expected);
      const at = head("mia") as { offset?: number };
      expect(leafStates(shadow)).toEqual(at.offset === undefined ? rest : referenceStates(artifact, { talk: at.offset }));
    }
  });

  test("a skip ends the speech: the play in progress finishes and no other starts", async () => {
    const { playback, head } = await speaking();
    playback.speak("mia", [[0, 2]]);
    playback.advance(0.05);
    expect(head("mia")).toEqual(playing(0.5));
    playback.speak("mia", []);
    playback.advance(0.03);
    expect(head("mia")).toEqual(playing(0.8));
    playback.advance(0.05);
    expect(head("mia")).toEqual({ phase: "off" });
    playback.advance(1);
    expect(head("mia")).toEqual({ phase: "off" });
  });

  test("pausing freezes the flap on its frame", async () => {
    const { playback, head, shadow, artifact } = await speaking();
    playback.speak("mia", [[0, 2]]);
    playback.advance(0.04);
    const frozen = leafStates(shadow);
    expect(frozen).toEqual(referenceStates(artifact, { talk: 0.4 }));
    playback.setPaused(true);
    playback.advance(0.5);
    expect(head("mia")).toEqual(playing(0.4));
    expect(leafStates(shadow)).toEqual(frozen);
    playback.setPaused(false);
    playback.advance(0.03);
    expect(head("mia")).toEqual(playing(0.7));
  });

  test("`Animate portraits` off holds a speaking portrait at rest", async () => {
    const { playback, head, shadow, rest } = await speaking();
    playback.speak("mia", [[0, 2]]);
    playback.setEnabled(false);
    for (const step of [0.03, 0.05, 0.2]) {
      playback.advance(step);
      expect(head("mia")).toEqual({ phase: "off" });
      expect(leafStates(shadow)).toEqual(rest);
    }
  });

  test("every portrait of the speaker flaps, and another character's portrait stays at rest", async () => {
    const two = await speaking("mia@night");
    two.playback.speak("mia", [[0, 2]]);
    two.playback.advance(0.05);
    expect(two.head("mia")).toEqual(playing(0.5));
    expect(two.head("mia@night")).toEqual(playing(0.5));
    const other = await speaking("bunny");
    other.playback.speak("mia", [[0, 2]]);
    other.playback.advance(0.05);
    expect(other.head("mia")).toEqual(playing(0.5));
    expect(other.head("bunny")).toEqual({ phase: "off" });
  });

  test("the page times the speech from the beat's start, as the text reveal is", async () => {
    const { h, playback, head } = await speaking();
    const timeline = h.overlay.ownerDocument.timeline as unknown as { currentTime: number };
    timeline.currentTime = 1_000;
    h.ui.onReceiveNotification({ jsonrpc: "2.0", method: "morph/speech", params: { character: "mia", spans: [[0, 0.3]], time: 1_200 } } as any);
    playback.advance(0.15);
    expect(head("mia")).toEqual({ phase: "off" });
    playback.advance(0.1);
    expect(head("mia")).toEqual(playing(0.5));
  });

  test("a continued line that changes the speaker's expression flaps exactly as it would without the change", async () => {
    const timing = `  timing {
    trigger = speech
    duration = 0.1
    easing = linear
    iteration_delay_min = 0.2
    iteration_delay_max = 0.6
  }
`;
    const run = async (nextLook: string) => {
      const source = `${CHARACTERS}\n${talkScript(timing)}\n\nscene start\n  MIA:\n    [[show portrait mia@night]]\n    Hello there my old friend, how are you ..>..[[show portrait ${nextLook}]] doing on this fine and sunny day, my dear?\nend\n`;
      const h = createDOMHarness(source, 0, { files: [art("mia@night"), art("mia@day")] });
      const playback = MorphPlayback.for(h.overlay);
      playback.configure({ host: inProcessHost(() => h.game.program), seed: "test", ...manualFrames() });
      await h.ready;
      h.game.context.system.previewing = undefined;
      h.jumpTo("start");
      await flushMicrotasks(10);
      const shown = () =>
        [...(playback as any).layers]
          .filter((layer: any) => layer.active && layer.span.isConnected)
          .flatMap((layer: any) => layer.images.flatMap((image: any) => image.plays.map((p: any) => ({ image: p.play.ref.image, occurrence: p.occurrence }))));
      const present = async (beat: any) => {
        const before = (playback as any).speech;
        const coordinator = new Coordinator(h.game, beat);
        for (let n = 0; n < 40 && (playback as any).speech === before; n++) {
          await flushMicrotasks(10);
          coordinator.onUpdate({ deltaMS: 0 } as Clock);
        }
        await flushMicrotasks(10);
        expect((playback as any).speech?.spans.length).toBeGreaterThan(0);
      };
      await present(h.nextBeat()!);
      const spoken = (playback as any).speech.spans.at(-1)[1] as number;
      for (let step = 0; step < 200 && playback.now < spoken + 0.03; step++) playback.advance(0.05);
      const second = h.nextBeat()!;
      expect(second.extended).toBeDefined();
      expect(second.image?.["portrait"]?.[0]?.assets).toEqual([nextLook]);
      await present(second);
      expect(shown().map((entry) => entry.image)).toEqual([nextLook]);
      const heads: unknown[] = [];
      for (let step = 0; step < 30; step++) {
        heads.push(playback.playhead(shown()[0]!.occurrence));
        playback.advance(0.05);
      }
      return heads;
    };
    const unchanged = await run("mia@night");
    const changed = await run("mia@day");
    expect(changed).toEqual(unchanged);
    expect(new Set(unchanged.map((head: any) => head.phase))).toEqual(new Set(["playing", "between", "off"]));
  });

  test("a portrait replaced by another character's look on the same drawing flaps for the new character", async () => {
    const source = `${CHARACTERS}
define bob as character with
  name = "BOB"
end

define mia@look as filtered_image with
  image = image.face
end

define bob@look as filtered_image with
  image = image.face
end

${talkScript(SPEECH_TIMING)}

scene start
  MIA:
    [[show portrait mia@look]]
    First line.
  BOB:
    [[show portrait bob@look]]
    Second line.
end
`;
    const h = createDOMHarness(source, 0, { files: [art("face")] });
    const playback = MorphPlayback.for(h.overlay);
    playback.configure({ host: inProcessHost(() => h.game.program), seed: "test", ...manualFrames() });
    await h.ready;
    const shown = () =>
      [...(playback as any).layers].filter((layer: any) => layer.live).flatMap((layer: any) => layer.images.flatMap((image: any) => image.plays.map((p: any) => p.occurrence)));
    await h.preview(lineOf(source, "First line."));
    await flushMicrotasks(10);
    await until(() => shown().length === 1, "Mia's look");
    expect(shown()[0].owner).toBe("mia");
    await h.preview(lineOf(source, "Second line."));
    await flushMicrotasks(10);
    await until(() => shown().length === 1 && shown()[0].owner === "bob", "Bob's look");
    playback.speak("bob", [[0, 2]]);
    playback.advance(0.05);
    expect(playback.playhead(shown()[0])).toEqual(playing(0.5));
    playback.speak("mia", [[0, 2]]);
    playback.advance(0.2);
    expect(playback.playhead(shown()[0])).toEqual({ phase: "off" });
  });

  describe("an outgoing look", () => {
    const source = `${CHARACTERS}\n${blinkScript(TIMING)}\n${talkScript(SPEECH_TIMING)}\n\nscene start\n  MIA:\n    [[show portrait mia@night]]\n    First line.\nend\n`;

    async function replacing(after: number) {
      const h = createDOMHarness(source, 0, { files: [art("mia@night"), art("mia@day")] });
      const playback = MorphPlayback.for(h.overlay);
      playback.configure({ host: inProcessHost(() => h.game.program), seed: "test", ...manualFrames() });
      await h.ready;
      await h.preview(lineOf(source, "First line."));
      await flushMicrotasks(10);
      await until(() => playback.stats.live === 1, "the first look");
      const g = globalThis as any;
      const installed = [g.Animation, g.KeyframeEffect];
      const finishers: (() => void)[] = [];
      g.KeyframeEffect = class {
        constructor(
          public target?: unknown,
          public keyframes?: unknown,
          public options?: EffectTiming,
        ) {}
        getTiming() {
          return this.options ?? {};
        }
      };
      g.Animation = class {
        startTime: number | null = null;
        finished: Promise<unknown>;
        constructor(public effect?: { target?: Element }) {
          this.finished = effect?.target?.classList.contains("instance")
            ? new Promise((resolve) => finishers.push(() => resolve(this)))
            : Promise.resolve(this);
        }
        play() {}
        cancel() {}
        finish() {}
      };
      restore = ((previous) => () => {
        g.Animation = installed[0];
        g.KeyframeEffect = installed[1];
        previous?.();
      })(restore);
      const timeline = h.overlay.ownerDocument.timeline as unknown as { currentTime: number };
      timeline.currentTime = 1_000;
      const layers = () => [...(playback as any).layers] as any[];
      const outgoing = layers()[0];
      playback.speak("mia", [[0, 4]]);
      void h.game.module.ui.image.write("portrait", [{ control: "show", assets: ["mia@day"], with: "fade", after }], false);
      await until(() => layers().some((layer) => layer.images[0].plays[0].play.ref.image === "mia@day"), "the incoming look");
      await flushMicrotasks(10);
      return { h, playback, outgoing, layers, timeline, finish: () => finishers.forEach((finish) => finish()) };
    }

    test("keeps its flap and blink until its delayed fade starts, then freezes, and is disposed when the fade ends", async () => {
      const { playback, outgoing, layers, timeline, finish } = await replacing(0.5);
      const shadow = shadowOf(outgoing.span)!;
      expect(outgoing.active).toBe(true);
      const frames = new Set<string>();
      for (let step = 0; step < 8; step++) {
        playback.advance(0.05);
        frames.add(JSON.stringify(leafStates(shadow)));
      }
      expect(frames.size).toBeGreaterThan(1);
      expect(outgoing.active).toBe(true);
      timeline.currentTime = 1_501;
      await until(() => !outgoing.active, "the outgoing look to freeze");
      const frozen = JSON.stringify(leafStates(shadow));
      for (let step = 0; step < 8; step++) {
        playback.advance(0.05);
        expect(JSON.stringify(leafStates(shadow))).toBe(frozen);
      }
      finish();
      await until(() => layers().length === 1, "the outgoing look to be disposed");
      expect(outgoing.span.isConnected).toBe(false);
      expect(playback.stats.occurrences).toBe(2);
    });

    test("freezes at once when its fade starts at once", async () => {
      const { outgoing, layers, finish } = await replacing(0);
      expect(outgoing.active).toBe(false);
      finish();
      await until(() => layers().length === 1, "the outgoing look to be disposed");
    });
  });
});

describe("morph claims", () => {
  test("two morphs claiming one image's group are reported, and the image stays still", async () => {
    const second = blinkScript(TIMING).replace("morph blink", "morph wink");
    const source = `${blinkScript(TIMING)}
${second}


scene start
  HERO:
    [[show portrait bunny]]
    Line.
end
`;
    const writes: any[] = [];
    const h = createDOMHarness(source, 0, {
      files: FILES,
      afterEachMessage: (message) => {
        const ops = message?.method === "ui/batch" ? message.params.messages : [message];
        for (const op of ops) if (op?.method === "ui/write-image") writes.push(op);
      },
    });
    const logged: [unknown, string][] = [];
    (h.game as any)._context.system.log = (message: unknown, severity: string) => logged.push([message, severity]);
    await h.ready;
    await h.preview(lineOf(source, "Line."));
    await flushMicrotasks(10);
    const write = writes.find((w) => w.params.target === "portrait" && w.params.instructions.length);
    expect(write.params.instructions[0].content.morph).toBeUndefined();
    const warnings = logged.filter(([, severity]) => severity === "warning").map(([m]) => String(m));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("`blink`, `wink`");
    expect(warnings[0]).toContain("`eyes`");
  });
});

describe("layer motion on the morph's clock", () => {
  const POSE = "        state = closed\n      }\n";
  const motionSource = (timing = TIMING) => {
    const source = SOURCE.replace(TIMING, timing);
    expect(source).toContain(POSE);
    return source.replace(POSE, `${POSE}      nose {\n        translate = 0 -2px\n        rotate = 2deg\n      }\n`);
  };
  const MIDDLE = 0.33333;

  function recordingAnimator() {
    const effects: { element: Element; keyframes: Keyframe[]; samples: number[]; cancels: number }[] = [];
    const animate = (element: Element, keyframes: Keyframe[]) => {
      const effect = { element, keyframes, samples: [] as number[], cancels: 0 };
      effects.push(effect);
      return {
        sample: (offset: number) => effect.samples.push(offset),
        cancel: () => {
          effect.cancels += 1;
        },
      };
    };
    return { effects, animate };
  }

  async function moving(source = motionSource(), recorder: ReturnType<typeof recordingAnimator> | null = recordingAnimator(), before?: (view: any) => void) {
    const writes: any[] = [];
    const h = createDOMHarness(source, 0, {
      files: FILES,
      afterEachMessage: (message) => {
        const ops = message?.method === "ui/batch" ? message.params.messages : [message];
        for (const op of ops) if (op?.method === "ui/write-image") writes.push(op);
      },
    });
    before?.(h.overlay.ownerDocument.defaultView);
    const playback = MorphPlayback.for(h.overlay);
    playback.configure({ host: inProcessHost(() => h.game.program), seed: "test", ...manualFrames(), ...(recorder ? { animate: recorder.animate } : {}) });
    await h.ready;
    await h.preview(lineOf(source, "First line."));
    await flushMicrotasks(10);
    await until(() => playback.stats.live === 1, "the artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = (playback as any).layers.values().next().value.images[0].slot.artifact as MorphArtifact;
    return { h, playback, writes, recorder: recorder!, shadow, artifact };
  }

  const offsets = (track: { offset?: number | null }[]) => track.map((k) => Math.round((k.offset ?? NaN) * 1e5) / 1e5);

  test("the write carries each moved layer's keyframes, identity where the ends leave a property out", async () => {
    const { writes, artifact } = await moving();
    const play = writes.find((w) => w.params.target === "portrait" && w.params.instructions.length).params.instructions[0].content.morph.plays[0];
    expect(Object.keys(play.motion)).toEqual(["nose"]);
    expect(offsets(play.motion.nose)).toEqual([0, MIDDLE, 1]);
    expect(play.motion.nose.map((k: any) => k.values)).toEqual([
      { translate: "0px", rotate: "0deg" },
      { translate: "0 -2px", rotate: "2deg" },
      { translate: "0px", rotate: "0deg" },
    ]);
    expect(artifact.parts.filter((p) => p.svg.includes("data-morph-motion='nose'"))).toHaveLength(1);
    expect(JSON.stringify(play).length).toBeLessThan(1500);
  });

  test("a moved layer is sampled at the offset its shapes and apertures are drawn at, and holds when the story pauses", async () => {
    const { playback, recorder, shadow, artifact } = await moving();
    const wrapper = shadow.querySelector('[data-morph-motion="nose"]')!;
    expect(wrapper.firstElementChild?.getAttribute("data-name")).toBe("nose");
    expect(recorder.effects.length).toBe(1);
    const [effect] = recorder.effects;
    expect(effect!.element === wrapper).toBe(true);
    expect(offsets(effect!.keyframes)).toEqual([0, MIDDLE, 1]);
    expect(effect!.keyframes.map(({ offset: _offset, ...rest }) => rest)).toEqual([
      { translate: "0px", rotate: "0deg" },
      { translate: "0 -2px", rotate: "2deg" },
      { translate: "0px", rotate: "0deg" },
    ]);
    expect(effect!.samples).toEqual([0]);
    playback.advance(0.4 * 0.25);
    expect(effect!.samples).toEqual([0, 0.4]);
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, 0.4));
    playback.setPaused(true);
    playback.advance(0.1);
    expect(effect!.samples).toEqual([0, 0.4]);
    playback.setPaused(false);
    playback.advance(0.2 * 0.25);
    expect(effect!.samples.at(-1)).toBeCloseTo(0.6, 9);
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, effect!.samples.at(-1)!));
    expect(recorder.effects.length).toBe(1);
  });

  test("the play's easing is applied once: the layer is sampled at the eased offset the shapes use", async () => {
    const { playback, recorder, shadow, artifact } = await moving(motionSource(TIMING.replace("easing = linear", "easing = steps(3)")));
    playback.advance(0.4 * 0.25);
    const [effect] = recorder.effects;
    expect(effect!.samples).toEqual([0, 1 / 3]);
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, 1 / 3));
    expect(effect!.keyframes.every((k) => !("easing" in k))).toBe(true);
  });

  test("turning animation off returns the layer to rest; clearing the portrait releases its effect", async () => {
    const { h, playback, recorder } = await moving();
    playback.advance(0.4 * 0.25);
    const [effect] = recorder.effects;
    playback.setEnabled(false);
    expect(effect!.cancels).toBe(1);
    playback.advance(0.1);
    expect(effect!.samples).toEqual([0, 0.4]);
    playback.setEnabled(true);
    playback.advance(0.2 * 0.25);
    expect(effect!.samples.at(-1)).toBeCloseTo(0.2, 9);
    await h.game.module.ui.image.clear("portrait");
    await flushMicrotasks(10);
    expect(effect!.cancels).toBe(2);
    expect(playback.stats).toEqual({ layers: 0, live: 0, occurrences: 0 });
  });

  test("the page's animator holds a paused animation on the document's timeline and only ever sets its time from the morph's offset", async () => {
    const made: FakeAnimation[] = [];
    class FakeEffect {
      constructor(
        readonly target: Element,
        readonly keyframes: Keyframe[],
        readonly options: unknown,
      ) {}
    }
    class FakeAnimation {
      currentTime: number | null = null;
      cancels = 0;
      plays = 0;
      constructor(
        readonly effect: FakeEffect,
        readonly timeline: unknown,
      ) {
        made.push(this);
      }
      cancel() {
        this.cancels += 1;
        this.currentTime = null;
      }
      play() {
        this.plays += 1;
      }
      pause() {
        this.plays += 1;
      }
    }
    let view: any;
    let saved: { effect: unknown; animation: unknown } | undefined;
    const timeline = { currentTime: 0 };
    const install = (window: any) => {
      view = window;
      saved = { effect: window.KeyframeEffect, animation: window.Animation };
      window.KeyframeEffect = FakeEffect;
      window.Animation = FakeAnimation;
      Object.defineProperty(window.document, "timeline", { value: timeline, configurable: true });
    };
    try {
      const { h, playback, shadow } = await moving(motionSource(), null, install);
      expect(made).toHaveLength(1);
      const [animation] = made;
      expect(animation!.timeline).toBe(timeline);
      expect(animation!.effect.target === shadow.querySelector('[data-morph-motion="nose"]')).toBe(true);
      expect(animation!.effect.options).toEqual({ duration: 1000, fill: "both" });
      expect(animation!.currentTime).toBe(0);
      playback.advance(0.4 * 0.25);
      expect(animation!.currentTime).toBeCloseTo(400, 9);
      playback.setPaused(true);
      playback.advance(0.1);
      expect(animation!.currentTime).toBeCloseTo(400, 9);
      playback.setEnabled(false);
      expect(animation!.cancels).toBe(1);
      expect(animation!.currentTime).toBeNull();
      await h.game.module.ui.image.clear("portrait");
      await flushMicrotasks(10);
      expect(animation!.cancels).toBe(2);
      expect(animation!.plays).toBe(0);
    } finally {
      if (view && saved) {
        view.KeyframeEffect = saved.effect;
        view.Animation = saved.animation;
        delete view.document.timeline;
      }
    }
  });
});
