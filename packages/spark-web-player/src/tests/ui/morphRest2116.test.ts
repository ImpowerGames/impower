import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphArtifact, MorphRef, MorphTiming } from "@impower/sparkdown/src/morph/types";
import { talkingPortrait } from "@impower/sparkdown/src/tests/morph/fixtures";
import { MorphPlayback, type MorphImageContent } from "../../app/morph/MorphPlayback";
import { flushMicrotasks, installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const SHUT = buildMorphRecipe("shut", {
  blend: "cut",
  fallback: "cut",
  keyframes: [
    { offset: 0, mouth: { state: "closed" } },
    { offset: 1, mouth: { state: "open" } },
  ],
});

const timing: MorphTiming = { duration: 0.25, delay: 1, easing: "linear", iterations: 1, direction: "normal" };
const ref: MorphRef = { morphs: ["shut"], key: "k-shut", image: "bunny", selection: "{}", groups: ["mouth"] };
const BACKGROUND = 'url("rest.svg")';
const STILL = 'url("still.svg")';
const content: MorphImageContent = {
  plays: [{ layer: 0, ref, morph: "shut", timing, definition: "d" }],
  epoch: 0,
  still: STILL,
};

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

function setup() {
  const env = installJSDOM();
  restore = env.restore;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const baked: { artifact?: MorphArtifact } = {};
  const inner = createMorphHost({
    service: new MorphBakeService({ createObjectURL: () => "blob:rest", revokeObjectURL: () => {} }),
    channel: () => ({ recipes: { shut: serializeMorphRecipe(SHUT) }, variants: {} }),
    readSource: async () => ({ text: talkingPortrait() }),
  });
  const host: MorphHost = {
    resolve: async (r, options) => {
      await gate;
      const handle = await inner.resolve(r, options);
      baked.artifact = handle.artifact;
      return handle;
    },
  };
  const playback = new MorphPlayback(env.overlay, { host, seed: "s", requestFrame: () => 0, cancelFrame: () => {} });
  const span = env.overlay.ownerDocument.createElement("span");
  span.style.backgroundImage = BACKGROUND;
  env.overlay.appendChild(span);
  return { playback, span, release, baked };
}

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const shownNodes = (span: HTMLElement) => {
  const shadow = span.querySelector(":scope > span.morph")?.shadowRoot;
  return new Set(
    Array.from(shadow?.querySelectorAll("[data-morph]") ?? [])
      .filter((el) => !/display:\s*none/.test(el.getAttribute("style") ?? ""))
      .map((el) => el.getAttribute("data-morph")!),
  );
};

const showsState = (span: HTMLElement, artifact: MorphArtifact, state: string) => {
  const shown = shownNodes(span);
  const nodes = artifact.visibility["mouth"]![state]!;
  return nodes.length > 0 && nodes.every((node) => shown.has(node));
};

describe("a morph's still, first frame and rest in the page", () => {
  test("the still shows while the artifact is pending, and the first live frame shows the same first keyframe", async () => {
    const { playback, span, release, baked } = setup();
    playback.mount(span, content, BACKGROUND, "background", "portrait:0");
    await flushMicrotasks(10);
    expect(span.style.backgroundImage).toBe(STILL);
    release();
    await until(() => playback.stats.live === 1, "the artifact");
    expect(span.style.backgroundImage).toBe("none");
    expect(showsState(span, baked.artifact!, "closed")).toBe(true);
    expect(showsState(span, baked.artifact!, "open")).toBe(false);
  });

  test("a one-shot morph shows its first keyframe before it plays and its last pose after", async () => {
    const { playback, span, release, baked } = setup();
    playback.mount(span, content, BACKGROUND, "background", "portrait:0");
    release();
    await until(() => playback.stats.live === 1, "the artifact");
    playback.advance(0.5);
    expect(showsState(span, baked.artifact!, "closed")).toBe(true);
    playback.advance(1);
    expect(showsState(span, baked.artifact!, "open")).toBe(true);
    expect(showsState(span, baked.artifact!, "closed")).toBe(false);
  });

  test("`Animate portraits` off shows the rest, pending and live", async () => {
    const { playback, span, release, baked } = setup();
    playback.setEnabled(false);
    playback.mount(span, content, BACKGROUND, "background", "portrait:0");
    await flushMicrotasks(10);
    expect(span.style.backgroundImage).toBe(BACKGROUND);
    playback.setEnabled(true);
    expect(span.style.backgroundImage).toBe(STILL);
    playback.setEnabled(false);
    expect(span.style.backgroundImage).toBe(BACKGROUND);
    release();
    await until(() => playback.stats.live === 1, "the artifact");
    expect(showsState(span, baked.artifact!, "open")).toBe(true);
    expect(showsState(span, baked.artifact!, "closed")).toBe(false);
  });

  test("a stack keeps every image's still until all of its artifacts are ready, and the rest while playback is off", async () => {
    const env = installJSDOM();
    restore = env.restore;
    const inner = createMorphHost({
      service: new MorphBakeService({ createObjectURL: () => "blob:rest", revokeObjectURL: () => {} }),
      channel: () => ({ recipes: { shut: serializeMorphRecipe(SHUT) }, variants: {} }),
      readSource: async () => ({ text: talkingPortrait() }),
    });
    const releases = new Map<string, () => void>();
    const gates = new Map(["a", "b"].map((key) => [key, new Promise<void>((resolve) => releases.set(key, resolve))]));
    const host: MorphHost = {
      resolve: async (r, options) => {
        await gates.get(r.key);
        return inner.resolve(r, options);
      },
    };
    const playback = new MorphPlayback(env.overlay, { host, seed: "s", requestFrame: () => 0, cancelFrame: () => {} });
    const span = env.overlay.ownerDocument.createElement("span");
    env.overlay.appendChild(span);
    const stack: MorphImageContent = {
      plays: ["a", "b"].map((key, layer) => ({ layer, ref: { ...ref, key, image: key }, morph: "shut", timing, definition: "d" })),
      epoch: 0,
      still: 'url("first-b.svg"), url("first-a.svg")',
    };
    playback.mount(span, stack, 'url("rest-b.svg"), url("rest-a.svg")', "background", "portrait:0");
    await flushMicrotasks(10);
    expect(span.style.backgroundImage).toBe(stack.still);
    releases.get("a")!();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(span.querySelector(":scope > span.morph")).toBeNull();
    expect(span.style.backgroundImage).toBe(stack.still);
    playback.setEnabled(false);
    expect(span.style.backgroundImage).toBe('url("rest-b.svg"), url("rest-a.svg")');
    playback.setEnabled(true);
    expect(span.style.backgroundImage).toBe(stack.still);
    releases.get("b")!();
    await until(() => playback.stats.live === 1, "both artifacts");
    expect(span.style.backgroundImage).toBe("none");
  });

  test("a mask shows the rest, never the still", async () => {
    const { playback, span } = setup();
    span.style.backgroundImage = "";
    playback.mount(span, content, BACKGROUND, "mask", "portrait:mask:0");
    await flushMicrotasks(10);
    expect(span.style.backgroundImage).toBe("");
  });
});
