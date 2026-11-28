import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphArtifact, MorphRef, MorphTiming } from "@impower/sparkdown/src/morph/types";
import type { LayeredPicture } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { talkingPortrait } from "@impower/sparkdown/test/morph/fixtures";
import { MorphGroup, MorphPlayback, type MorphImageContent } from "../../src/app/morph/MorphPlayback";
import { drawPosesOnCanvases, layOutPictures, showsPose, untilDrawn } from "./canvasPoses";
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
const content: MorphImageContent = {
  plays: [{ layer: 0, ref, morph: "shut", timing, definition: "d" }],
  epoch: 0,
};
const pictures: LayeredPicture[] = [{ layer: 0, span: 1, name: "bunny", vector: true, files: [{ src: "rest.svg", name: "rest.svg" }] }];

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

function setup() {
  const env = installJSDOM();
  const unlayOut = layOutPictures(env.overlay.ownerDocument, { width: 400, height: 300 }, "span.portrait");
  restore = () => {
    unlayOut();
    env.restore();
  };
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
  const poses = drawPosesOnCanvases(playback, { text: (src) => (src === "rest.svg" ? talkingPortrait() : undefined), frameRate: 24 });
  const span = env.overlay.ownerDocument.createElement("span");
  span.className = "portrait";
  span.style.backgroundImage = BACKGROUND;
  env.overlay.appendChild(span);
  const mount = () => playback.mount(span, content, BACKGROUND, "background", "portrait:0", new MorphGroup(), pictures);
  const shown = () => poses.shownText(span.querySelector(":scope > span.morph")?.shadowRoot);
  return { playback, span, release, baked, mount, shown };
}

describe("a morph's first frame and rest in the page", () => {
  test("the first frame drawn once the artifact is ready shows the first keyframe", async () => {
    const { playback, release, baked, mount, shown } = setup();
    mount();
    await flushMicrotasks(10);
    release();
    await untilDrawn(playback, "the artifact's poses");
    expect(showsPose(shown(), baked.artifact!, { shut: 0 })).toBe(true);
    expect(showsPose(shown(), baked.artifact!, { shut: 1 })).toBe(false);
  });

  test("a one-shot morph shows its first keyframe before it plays and its last pose after", async () => {
    const { playback, release, baked, mount, shown } = setup();
    mount();
    release();
    await untilDrawn(playback, "the artifact's poses");
    playback.advance(0.5);
    expect(showsPose(shown(), baked.artifact!, { shut: 0 })).toBe(true);
    playback.advance(1);
    expect(showsPose(shown(), baked.artifact!, { shut: 1 })).toBe(true);
    expect(showsPose(shown(), baked.artifact!, { shut: 0 })).toBe(false);
  });

  test("`Animate portraits` off shows the rest", async () => {
    const { playback, release, baked, mount, shown } = setup();
    playback.setEnabled(false);
    mount();
    release();
    await untilDrawn(playback, "the artifact's poses");
    expect(showsPose(shown(), baked.artifact!, {})).toBe(true);
  });

  test("a mask shows the rest", async () => {
    const { playback, span } = setup();
    span.style.backgroundImage = "";
    playback.mount(span, content, BACKGROUND, "mask", "portrait:mask:0");
    await flushMicrotasks(10);
    expect(span.style.backgroundImage).toBe("");
  });
});
