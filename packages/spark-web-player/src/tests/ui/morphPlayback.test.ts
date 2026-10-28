// Live portrait morphs on the page: the real engine's image writes reach the
// real UIManager, which draws each morph's artifact inline and poses it on a
// clock (`app/morph/MorphPlayback.ts`). Artifacts are baked in process from
// the artwork the program carries, as a host without an asset service does.

import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost, inlineMorphSource, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { renderMorphAt } from "@impower/sparkdown/src/morph/render";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphArtifact, MorphRef, MorphTiming } from "@impower/sparkdown/src/morph/types";
import { blink, blinkScript, portrait } from "@impower/sparkdown/src/tests/morph/fixtures";
import { backgroundRect, layerValue, svgIntrinsicSize } from "../../app/morph/backgroundFit";
import { MorphPlayback, type MorphImageContent } from "../../app/morph/MorphPlayback";
import UIManager from "../../app/managers/UIManager";
import { UpdateElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/UpdateElementMessage";
import { cssList } from "@impower/sparkdown/src/morph/cssList";
import { createDOMHarness, createStubApp, flushMicrotasks, installJSDOM } from "./domTestHarness";

// A real game compiles, replays its route and bakes for each test here; on
// a busy machine that alone can outlast the default five seconds.
vi.setConfig({ testTimeout: 60_000 });

const TIMING = `  timing {
    duration = 0.25
    easing = linear
    iterations = infinite
  }
`;

const SOURCE = `${blinkScript(TIMING)}
-> start

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

// Both eyes in one clip entry, the left open and the right closed at rest,
// so the entry's aperture mask strokes its open loop with a second path.
const shiftRight = (d: string) => d.replace(/(-?[0-9.]+),(-?[0-9.]+)/g, (_m, x: string, y: string) => `${Number(x) + 120},${y}`);
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

/** Frames the playback requests, run by the test. */
function manualFrames() {
  const queue: ((now: number) => void)[] = [];
  return {
    requestFrame: (cb: (now: number) => void) => queue.push(cb),
    cancelFrame: () => {},
    /** Runs the frames pending now at `now` milliseconds. */
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

/** What each posed leaf of a live drawing shows: whether it is displayed, and its path data. */
function leafStates(root: ParentNode): Record<string, { shown: boolean; d: string | null }[]> {
  const out: Record<string, { shown: boolean; d: string | null }[]> = {};
  for (const el of Array.from(root.querySelectorAll("[data-morph]"))) {
    const node = el.getAttribute("data-morph")!;
    const style = el.getAttribute("style") ?? "";
    (out[node] ??= []).push({ shown: !/display:\s*none/.test(style), d: el.getAttribute("d") });
  }
  return out;
}

function referenceStates(artifact: MorphArtifact, offset: number) {
  const doc = new DOMParser().parseFromString(renderMorphAt(artifact, offset), "image/svg+xml");
  return leafStates(doc);
}

/**
 * The path data and style of every path each aperture mask draws its
 * aperture with, and the path data of the clip path its reach is clipped to
 * where a path refers to one.
 */
function apertureStates(root: ParentNode): { d: string | null; style: string | null; reach?: string | null }[][] {
  return Array.from(root.querySelectorAll("mask")).map((mask) =>
    Array.from(mask.querySelectorAll(":scope > path")).map((path) => {
      const style = path.getAttribute("style");
      const bound = /clip-path:url\(#([^)]+)\)/.exec(style ?? "")?.[1];
      const reach = bound === undefined ? undefined : (mask.querySelector(`:scope > clipPath[id="${bound}"] > path`)?.getAttribute("d") ?? null);
      // The clip path's id carries the occurrence's prefix; its path data
      // stands for it.
      return { d: path.getAttribute("d"), style: style?.replace(/clip-path:url\(#[^)]+\)/, "clip-path:url(#reach)") ?? null, ...(reach === undefined ? {} : { reach }) };
    }),
  );
}

function referenceApertures(artifact: MorphArtifact, offset: number) {
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
    expect(content.morph.plays[0].ref).toMatchObject({ morph: "blink", image: "bunny", groups: ["eyes"] });
    expect(content.morph.plays[0].layer).toBe(0);
    // References, never artifacts: no parts or frames cross the boundary,
    // and the morph adds a few hundred bytes to the write.
    expect(JSON.stringify(content.morph).length).toBeLessThan(1000);
    expect(JSON.stringify(write)).not.toContain("data-morph");
    const span = portraitSpan(h.overlay)!;
    // The bake is still under way: the span shows its static image, with no
    // live drawing of its own yet.
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

  test("inline art animates with the page's own host: the game bakes it and sends the artifact", async () => {
    const h = createDOMHarness(SOURCE, 0, { files: FILES });
    // The production host: no in-process baking on the page.
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
    // The page's own ask on mounting raced the first bake, which answered it.
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
    const source = `-> start

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
    const artifact = (playback as any).layers.values().next().value.plays[0].slot.artifact as MorphArtifact;
    // No game clock is attached: the playback asks for frames of its own.
    expect(frames.pending).toBeGreaterThan(0);
    frames.run(1000);
    // At rest each aperture keeps the reach past its outline it is written
    // with, unclipped; away from its rest outline it reaches as far, clipped
    // to the moving edges' drawings.
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
    // Ids are the occurrence's own, never the artifact's.
    const ids = Array.from(shadow.querySelectorAll("[id]")).map((e) => e.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => !id.startsWith(artifact.idPrefix))).toBe(true);
  });

  test("an aperture with a closed loop strokes its open loops alone at rest, and every path follows the frames away from it", async () => {
    expect(WINK_SOURCE).toContain("eyelash-right");
    expect(WINK_SOURCE).toContain("eyeball-white-right");
    const { h, frames, playback } = await previewed(WINK_SOURCE, WINK_FILES);
    await until(() => playback.stats.live === 1, "the artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = (playback as any).layers.values().next().value.plays[0].slot.artifact as MorphArtifact;
    frames.run(1000);
    const rest = apertureStates(shadow);
    expect(rest).toEqual(referenceApertures(artifact, 0));
    // Each mask fills both eyes unstroked and strokes the open eye alone.
    expect(rest.length).toBeGreaterThan(0);
    for (const [all, open] of rest) {
      expect(all!.style).toMatch(/stroke:none/);
      expect(open!.style).toMatch(/stroke-width:2px/);
      expect(open!.d).not.toBe(all!.d);
    }
    // Mid-blink every path draws the frame's whole aperture. The first
    // reaches past it, clipped to the moving edges, where its target paints
    // beneath every moving edge: the left white does, the right white,
    // drawn above the right eye's lashes, does not.
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
    // Back at the rest outline, the open loops' path gets its reach back.
    frames.run(1000 + 250);
    expect(apertureStates(shadow)).toEqual(rest);
  });

  test("pause freezes the exact frame; the preference returns to rest and starts a fresh cycle", async () => {
    const { h, playback } = await previewed();
    await until(() => playback.stats.live === 1, "the artifact");
    const shadow = shadowOf(portraitSpan(h.overlay))!;
    const artifact = (playback as any).layers.values().next().value.plays[0].slot.artifact as MorphArtifact;
    const rest = leafStates(shadow);
    playback.advance(0.6 * 0.25);
    const frozen = leafStates(shadow);
    expect(frozen).toEqual(referenceStates(artifact, 0.6));
    playback.setPaused(true);
    playback.advance(0.1);
    expect(leafStates(shadow)).toEqual(frozen);
    // Off returns to rest, even while paused, and stays there when the pause clears.
    playback.setEnabled(false);
    expect(leafStates(shadow)).toEqual(rest);
    playback.setPaused(false);
    playback.advance(0.1);
    expect(leafStates(shadow)).toEqual(rest);
    // On starts a fresh cycle from its beginning.
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
    const artifact = (playback as any).layers.values().next().value.plays[0].slot.artifact as MorphArtifact;
    playback.advance(0.1 * 0.25);
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, 0.4));
    // A different place: every occurrence starts again at rest.
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
});

describe("morph layers", () => {
  const recipeText = serializeMorphRecipe(blink());
  const ref = (key: string, image = "bunny"): MorphRef => ({ morph: "blink", key, image, selection: "{}", groups: ["eyes"] });
  const timing: MorphTiming = { duration: 0.25, delay: 0, easing: "linear", iterations: "infinite", direction: "normal" };
  const BG = 'url("bunny.svg")';
  const content = (overrides: Partial<MorphImageContent["plays"][number]> = {}, epoch = 0): MorphImageContent => ({
    plays: [{ layer: 0, ref: ref("k1"), timing, definition: "d1", ...overrides }],
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
    // Another variant of the same character: a different artifact, the same occurrence.
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
    // A second occurrence elsewhere on the screen has its own schedule.
    expect(playback.mount(span(), content(), BG, "background", "backdrop:0").occurrenceKeys[0]).not.toBe(base);
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
    expect((layer as any).plays[0].slot.state).toBe("failed");
    expect(b.querySelector("span.morph")).toBeNull();
    expect(b.style.backgroundImage).toContain("bunny.svg");
  });

  test("a mask shows the artifact's static rest render", async () => {
    const { playback, span } = setup();
    const mask = span();
    // The background lists the top image first: bunny.svg is drawn over under.svg.
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

  test("time stepped backwards starts every occurrence again at rest", async () => {
    const { playback, span } = setup();
    const el = span();
    playback.mount(el, content(), BG, "background", "portrait:0");
    await until(() => playback.stats.live === 1, "the artifact");
    const rest = leafStates(shadowOf(el)!);
    playback.advance(0.1);
    expect(leafStates(shadowOf(el)!)).not.toEqual(rest);
    playback.advance(-0.05);
    expect(leafStates(shadowOf(el)!)).toEqual(rest);
  });
});

describe("morph lifecycle at the page's boundaries", () => {
  const recipeText = serializeMorphRecipe(blink());
  const ref: MorphRef = { morph: "blink", key: "k1", image: "bunny", selection: "{}", groups: ["eyes"] };
  const timing: MorphTiming = { duration: 0.25, delay: 0.7, easing: "linear", iterations: "infinite", direction: "normal" };
  const content: MorphImageContent = { plays: [{ layer: 0, ref, timing, definition: "d1" }], epoch: 0 };
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
    // The frame already requested runs once more and finds nothing to draw.
    frames.run(1300);
    expect(frames.pending).toBe(0);
    const before = playback.now;
    const second = doc.createElement("span");
    env.overlay.appendChild(second);
    playback.mount(second, content, BG, "background", "portrait:1");
    await until(() => playback.stats.live === 1, "the second artifact");
    // Its first frame, long after the loop went idle, moves nothing.
    frames.run(10_000);
    expect(playback.now).toBe(before);
    frames.run(10_100);
    expect(playback.now).toBeCloseTo(before + 0.1, 9);
  });

  test("a clock step moves the morphs by the step alone", () => {
    const env = installJSDOM();
    restore = env.restore;
    const playback = new MorphPlayback(env.overlay, { host: bakingHost(), requestFrame: () => 0, cancelFrame: () => {} });
    (env.overlay as any).__sdMorphs = playback;
    const ui = new UIManager(createStubApp(env.overlay, () => {}));
    // `Application.skip` steps the clock without adding to its elapsed time,
    // then updates with the delta of the frame before.
    const clock = { elapsedTime: 0, deltaTime: 0 } as any;
    ui.onStart();
    ui.onUpdate(clock);
    Object.assign(clock, { elapsedTime: 0.1, deltaTime: 0.1 });
    ui.onUpdate(clock);
    expect(playback.now).toBeCloseTo(0.1, 9);
    ui.onSkip(0.2);
    ui.onUpdate(clock);
    expect(playback.now).toBeCloseTo(0.3, 9);
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
  const ref: MorphRef = { morph: "blink", key: "k1", image: "bunny", selection: "{}", groups: ["eyes"] };
  const timing: MorphTiming = { duration: 0.25, delay: 0, easing: "linear", iterations: "infinite", direction: "normal" };
  const content: MorphImageContent = { plays: [{ layer: 0, ref, timing, definition: "d1" }], epoch: 0 };

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
    // Any screen op may restyle the span; the span keeps its size.
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
    // The root covers the span as the static layer does; every part takes the
    // exact rectangle, unrounded, so none moves, scales or letterboxes.
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
    // The production host, which waits for the game's deliveries.
    const playback = new MorphPlayback(env.overlay, { requestFrame: () => 0, cancelFrame: () => {} });
    const asked: string[] = [];
    playback.askGame = (key) => {
      asked.push(key);
      playback.deliver({ key, artifact: artifactFor(key) });
    };
    // Far more deliveries than the page keeps, or remembers keeping: the
    // first one is long gone.
    const artifact = artifactFor("k");
    for (let i = 0; i < 1100; i++) playback.deliver({ key: `k${i}`, artifact: { ...artifact, key: `k${i}` } });
    const span = env.overlay.ownerDocument.createElement("span");
    env.overlay.appendChild(span);
    playback.mount(span, { ...content, plays: [{ ...content.plays[0]!, ref: { ...ref, key: "k0" } }] }, 'url("bunny.svg")', "background", "portrait:0");
    await until(() => playback.stats.live === 1, "the artifact asked for again");
    expect(asked).toEqual(["k0"]);
    // One still held is not asked for.
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
    // A browser reads `java<tab>script:` as `javascript:`.
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
    // Relative intrinsic dimensions give a ratio only: auto then contains.
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

describe("morph claims", () => {
  test("two morphs claiming one image's group are reported, and the image stays still", async () => {
    const second = blinkScript(TIMING).replace("morph blink", "morph wink");
    const source = `${blinkScript(TIMING)}
${second}
-> start

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
