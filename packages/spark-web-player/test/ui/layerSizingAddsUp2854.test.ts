import { WriteImageMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const svg = (fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${fill}"/></svg>`)}`;

const grow = (name: string, target: string, scale: number) => `animation ${name} {
  target = layer.${target}
  keyframes {
    { transform = "scale(1)" }
    { transform = "scale(${scale})" }
  }
  timing {
    duration = "1s"
  }
}
`;

const source = `define BASE as image with
  src = "${svg("#d33")}"
end

define TOP as image with
  src = "${svg("#3a3")}"
end

define STACK as layered_image with
  assets = { BASE, TOP }
end

${grow("growself", "self", 2)}
${grow("growportrait", "portrait", 2)}
${grow("growstage", "stage", 2)}
${grow("growimage", "image", 3)}

define stagegrow as transition with
  stage = animation.growself
end

define stagegrowstage as transition with
  stage = animation.growstage
end

layout main {
  stage {
    portrait {
      image
    }
  }
}

scene start
  [[show portrait STACK]]
  Ready.
end
`;

async function sizedFor(line: string) {
  const h = createDOMHarness(source, 0, { reactive: true });
  await h.ready;
  h.jumpTo("start");
  await h.display(h.nextBeat()!, true);
  await flushMicrotasks(30);
  h.game.context.system.previewing = undefined;
  timeline.currentTime = 100;
  animations.length = 0;
  (globalThis as any).Animation = TimedAnimation;
  (globalThis as any).KeyframeEffect = TimedEffect;
  Object.defineProperty(document, "timeline", { configurable: true, value: timeline });
  h.ui.morphs?.configure({ requestFrame: () => 0, cancelFrame: () => {} });
  const layers = Array.from(h.overlay.querySelectorAll(".portrait .image > *"))
    .map((el) => (el as any).__sdMorph)
    .filter(Boolean);
  const scales: number[] = [];
  for (const layer of layers) {
    const size = layer.size.bind(layer);
    layer.size = (reach: { zoom?: number; scale?: number }) => {
      scales.push(reach.scale ?? 1);
      return size(reach);
    };
  }
  const ui = h.ui as any;
  const writes: { target: string; instructions: unknown[] }[] = [];
  const writeImage = ui.writeImage.bind(ui);
  ui.writeImage = (target: string, instructions: unknown[], ...rest: unknown[]) => {
    writes.push({ target, instructions });
    ui.prepareDrawing(
      [WriteImageMessage.type.request({ target, instructions: instructions as never, instant: false })],
      new Map(),
    );
    return writeImage(target, instructions, ...rest);
  };
  const beat = h.game.module.interpreter.parse(line, "main", {} as any);
  void h.game.module.ui.image.write("portrait", beat.image!["portrait"]!, false);
  for (let i = 0; i < 10; i += 1) {
    await flushMicrotasks(10);
    ui.flushPendingBeat();
  }
  return { layers: layers.length, writes: writes.length, scale: Math.max(1, ...scales), sized: scales.length };
}

describe("a layered picture is sized through UIManager for the animations of one line that enlarge it (I-2854)", () => {
  test.each([
    ["[[animate portrait with growself]]", 2],
    ["[[animate portrait with growself with growself]]", 4],
    ["[[animate portrait with growself with growportrait]]", 4],
    ["[[animate portrait with stagegrow]]", 2],
    ["[[animate portrait with stagegrow with stagegrowstage]]", 4],
    ["[[animate portrait with stagegrow with growself]]", 4],
    ["[[animate portrait with growself with growimage]]", 6],
    ["[[animate portrait with growimage]]", 3],
  ])("`%s` sizes the layer for %s×", async (line, expected) => {
    const sized = await sizedFor(line);
    expect(sized.layers).toBe(1);
    expect(sized.writes).toBeGreaterThan(0);
    expect(sized.sized).toBeGreaterThan(0);
    expect(sized.scale).toBe(expected);
  });
});
