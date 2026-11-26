import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost } from "@impower/sparkdown/src/morph/hosts";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphRef, MorphTiming } from "@impower/sparkdown/src/morph/types";
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
const ref = (key: string): MorphRef => ({ morphs: ["shut"], key, image: key, selection: "{}", groups: ["mouth"] });
const BACKGROUND = 'url("hat-b.svg"), url("base-b.svg"), url("rest-a.svg")';
const plays = [
  { layer: 0, ref: ref("a"), morph: "shut", timing, definition: "d" },
  { layer: 1, ref: ref("b"), morph: "shut", timing, definition: "d" },
];

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

async function mount(content: MorphImageContent, repeat = "no-repeat, repeat, no-repeat") {
  const env = installJSDOM();
  const win = env.overlay.ownerDocument.defaultView!;
  const computedStyle = win.getComputedStyle;
  win.getComputedStyle = ((el: Element, pseudo?: string | null) => {
    const style = computedStyle.call(win, el, pseudo);
    return new Proxy(style, {
      get: (target, key) =>
        key === "getPropertyValue"
          ? (name: string) => (name === "background-repeat" ? repeat : target.getPropertyValue(name))
          : Reflect.get(target, key, target),
    });
  }) as typeof win.getComputedStyle;
  restore = () => {
    win.getComputedStyle = computedStyle;
    env.restore();
  };
  const host = createMorphHost({
    service: new MorphBakeService({ createObjectURL: () => "blob:rest", revokeObjectURL: () => {} }),
    channel: () => ({ recipes: { shut: serializeMorphRecipe(SHUT) }, variants: {} }),
    readSource: async () => ({ text: talkingPortrait() }),
  });
  const playback = new MorphPlayback(env.overlay, { host, seed: "s", requestFrame: () => 0, cancelFrame: () => {} });
  const span = env.overlay.ownerDocument.createElement("span");
  span.style.backgroundImage = BACKGROUND;
  env.overlay.appendChild(span);
  playback.mount(span, content, BACKGROUND, "background", "portrait:0");
  const shadow = () => span.querySelector(":scope > span.morph")?.shadowRoot ?? undefined;
  await until(() => !!shadow()?.querySelector("[data-morph]"), "the first picture's live view");
  await flushMicrotasks(10);
  const views = () => shadow()!.querySelectorAll("[data-morph]").length;
  const statics = () =>
    Array.from(shadow()?.children ?? [])
      .map((el) => /background-image:\s*([^;]*)/.exec(el.getAttribute("style") ?? "")?.[1])
      .filter((image) => image && image !== "none");
  return { playback, views, statics };
}

describe("a change morph's still, per picture", () => {
  test("with one picture built and the other unbuilt under a still of another layer count, the built one draws live and the other shows its old still", async () => {
    const { playback, views, statics } = await mount({ plays, epoch: 0, still: [{ layer: 1, span: 2, image: 'url("first-b.svg")' }] });
    expect(views()).toBeGreaterThan(0);
    expect(statics()).toEqual(['url("first-b.svg")']);
    playback.setEnabled(false);
    expect(statics()).toEqual(['url("base-b.svg")', 'url("hat-b.svg")']);
  });

  test("a still with its picture's layer count stands in only for the layers whose image is unbuilt", async () => {
    const { views, statics } = await mount({ plays, epoch: 0, still: [{ layer: 1, span: 2, image: 'url("first-hat-b.svg"), url("first-b.svg")' }] });
    expect(views()).toBeGreaterThan(0);
    expect(statics()).toEqual(['url("first-b.svg")', 'url("hat-b.svg")']);
  });

  test.each([
    ["above another picture", 1, "no-repeat, repeat, no-repeat"],
    ["at the bottom of the background", 0, "no-repeat, no-repeat, repeat"],
  ])("a still of another layer count keeps its old drawing when its picture's top layer draws live, %s", async (_, layer, repeat) => {
    const three = [...plays, { layer: 2, ref: ref("c"), morph: "shut", timing, definition: "d" }];
    const { views, statics } = await mount({ plays: three, epoch: 0, still: [{ layer, span: 2, image: 'url("first.svg")' }] }, repeat);
    expect(views()).toBeGreaterThan(0);
    expect(statics()).toEqual(['url("first.svg")']);
  });

  test("before any view is built, each picture's still takes its own place in the background", async () => {
    const env = installJSDOM();
    restore = env.restore;
    const playback = new MorphPlayback(env.overlay, { host: { resolve: () => new Promise(() => {}) }, seed: "s", requestFrame: () => 0, cancelFrame: () => {} });
    const span = env.overlay.ownerDocument.createElement("span");
    span.style.backgroundImage = BACKGROUND;
    env.overlay.appendChild(span);
    const still = [
      { layer: 0, span: 1, image: 'url("first-a.svg")' },
      { layer: 1, span: 2, image: 'url("first-b.svg")' },
    ];
    playback.mount(span, { plays, epoch: 0, still }, BACKGROUND, "background", "portrait:0");
    await flushMicrotasks(10);
    expect(span.style.backgroundImage).toBe('url("first-b.svg"), url("first-a.svg")');
    playback.setEnabled(false);
    expect(span.style.backgroundImage).toBe(BACKGROUND);
  });
});
