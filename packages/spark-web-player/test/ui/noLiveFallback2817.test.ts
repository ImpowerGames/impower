import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost } from "@impower/sparkdown/src/morph/hosts";
import { serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphRef, MorphTiming } from "@impower/sparkdown/src/morph/types";
import { blink, portrait } from "@impower/sparkdown/test/morph/fixtures";
import type { LayeredPicture } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { MorphGroup, MorphPlayback, type MorphImageContent } from "../../src/app/morph/MorphPlayback";
import { drawPosesOnCanvases, layOutPictures, untilDrawn } from "./canvasPoses";
import { installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const ART = portrait({ dx: 0, dy: 0 });
const STYLED = ART.replace("<svg ", '<svg style="filter:blur(2px)" ');
const ref: MorphRef = { morphs: ["blink"], key: "k1", image: "bunny", selection: "{}", groups: ["eyes"] };
const timing: MorphTiming = { duration: 0.25, delay: 0, easing: "linear", iterations: "infinite", direction: "normal" };
const content: MorphImageContent = { plays: [{ layer: 0, ref, morph: "blink", timing, definition: "d1" }], epoch: 0 };
const BG = 'url("bunny.svg")';
const PICTURES: LayeredPicture[] = [{ layer: 0, span: 1, name: "bunny", vector: true, files: [{ src: "bunny.svg", name: "bunny.svg" }] }];

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

function setup(text: string) {
  const env = installJSDOM();
  const unlayOut = layOutPictures(env.overlay.ownerDocument, { width: 400, height: 300 }, "span.portrait");
  restore = () => {
    unlayOut();
    env.restore();
  };
  const host = createMorphHost({
    service: new MorphBakeService({ createObjectURL: () => "blob:rest", revokeObjectURL: () => {} }),
    channel: () => ({ recipes: { blink: serializeMorphRecipe(blink()) }, variants: {} }),
    readSource: async () => ({ text: ART }),
  });
  const playback = new MorphPlayback(env.overlay, { host, seed: "s", requestFrame: () => 0, cancelFrame: () => {} });
  drawPosesOnCanvases(playback, { text: (src) => (src === "bunny.svg" ? text : undefined), frameRate: 24 });
  playback.placeholders = true;
  const reports = vi.fn();
  playback.reportStill = reports;
  const span = env.overlay.ownerDocument.createElement("span");
  span.className = "portrait";
  span.style.backgroundImage = BG;
  env.overlay.appendChild(span);
  const shadow = () => span.querySelector(":scope > span.morph")?.shadowRoot ?? null;
  const drawnAsCss = () =>
    [span, ...Array.from(shadow()?.children ?? [])]
      .map((element) => /background-image:\s*([^;]*)/.exec(element.getAttribute("style") ?? "")?.[1])
      .filter((image) => image && !/^none(,\s*none)*$/.test(image));
  return { playback, span, shadow, reports, drawnAsCss };
}

describe("a vector picture its canvas cannot draw is never drawn as live inline SVG or as CSS (#2817)", () => {
  test("an SVG whose root styling the player cannot draw shows the placeholder while its morph's artifact is ready, with one warning", async () => {
    const { playback, span, shadow, reports, drawnAsCss } = setup(STYLED);
    const layer = playback.mount(span, content, BG, "background", "portrait:0", new MorphGroup(), PICTURES);
    await until(() => playback.stats.layers === 1 && (layer as any).images[0].slot.state === "ready", "the morph's artifact");
    await until(() => !!shadow()?.querySelector("[data-undrawn]"), "the placeholder");
    playback.advance(0.1);
    expect(shadow()!.querySelector("[data-undrawn]")!.getAttribute("data-undrawn")).toBe("styled");
    expect(shadow()!.querySelectorAll("svg, [data-morph], canvas")).toHaveLength(0);
    expect(drawnAsCss()).toEqual([]);
    expect(reports).toHaveBeenCalledTimes(1);
    expect(reports.mock.calls[0]![0]).toMatchObject({ image: "bunny", reason: "styled", placeholder: true });
  });

  test("a morph on an image the write lists no picture for shows the placeholder, with one warning", async () => {
    const { playback, span, shadow, reports, drawnAsCss } = setup(ART);
    const layer = playback.mount(span, content, BG, "background", "portrait:0");
    await until(() => (layer as any).images[0].slot.state === "ready", "the morph's artifact");
    await until(() => !!shadow()?.querySelector("[data-undrawn]"), "the placeholder");
    playback.advance(0.1);
    expect(shadow()!.querySelector("[data-undrawn]")!.getAttribute("data-undrawn")).toBe("unlisted");
    expect(shadow()!.querySelectorAll("svg, [data-morph], canvas")).toHaveLength(0);
    expect(drawnAsCss()).toEqual([]);
    layer.layout();
    expect(reports).toHaveBeenCalledTimes(1);
    expect(reports.mock.calls[0]![0]).toMatchObject({ image: "bunny", reason: "unlisted", placeholder: true });
  });

  test("the same image with its picture listed is drawn on its canvas from drawn poses", async () => {
    const { playback, span, shadow, reports, drawnAsCss } = setup(ART);
    playback.mount(span, content, BG, "background", "portrait:0", new MorphGroup(), PICTURES);
    await until(() => playback.stats.live === 1, "the morph's artifact");
    await untilDrawn(playback);
    playback.advance(0.1);
    expect(shadow()!.querySelectorAll("canvas")).toHaveLength(1);
    expect(shadow()!.querySelectorAll("svg, [data-morph], [data-undrawn]")).toHaveLength(0);
    expect(drawnAsCss()).toEqual([]);
    expect(reports).not.toHaveBeenCalled();
  });
});
