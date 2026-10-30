import { describe, expect, test } from "vitest";
import { compileUI, createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFS = `define BG as image with
  src = "https://example.com/bg.png"
end

define pan_right as animation with
  keyframes = {
    background_position = "right"
  }
end

define slow_pan as animation with
  keyframes = {
    background_position = "right"
  }
  timing = {
    duration = "3s"
  }
end

layout main with
  stage {
    backdrop {
      image
    }
  }
end
`;

function story(body: string) {
  return `${DEFS}\n-> start\n\nscene start\n${body}\nend\n`;
}

async function runInstant(body: string) {
  const harness = createHarness(story(body));
  await harness.ready;
  harness.jumpToFlow("start");
  harness.reset();
  let beat = harness.nextBeat();
  while (beat) {
    await harness.display(beat, true);
    await flushMicrotasks();
    beat = harness.nextBeat();
  }
  return harness;
}

function findAnimateAnimation(harness: Awaited<ReturnType<typeof runInstant>>) {
  const writeImage = harness.messages.find((m) => m.method === "ui/write-image");
  expect(writeImage, "expected a ui/write-image message").toBeDefined();
  const animateInstr = writeImage.params.instructions.find(
    (i: any) => i.control === "animate",
  );
  expect(animateInstr, "expected an `animate` instruction").toBeDefined();
  return animateInstr.targetAnimations[0];
}

describe("authored define inherits its type's $default (compiler)", () => {
  test("`define X as animation` with no timing inherits the full default timing", () => {
    const { program } = compileUI(story(`  [[show backdrop BG]]`));
    const panRight = (program as any).context?.animation?.["pan_right"];
    expect(panRight).toBeDefined();
    expect(panRight.timing).toMatchObject({
      delay: 0,
      duration: 0,
      easing: "ease",
      iterations: 1,
      fill: "both",
      direction: "normal",
    });
    expect(panRight.target).toEqual({ $type: "layer", $name: "self" });
    expect(panRight.keyframes).toMatchObject({ background_position: "right" });
  });

  test("partial `timing` deep-merges: authored field wins, siblings inherited", () => {
    const { program } = compileUI(story(`  [[show backdrop BG]]`));
    const slowPan = (program as any).context?.animation?.["slow_pan"];
    expect(slowPan).toBeDefined();
    expect(slowPan.timing).toMatchObject({
      duration: "3s",
      delay: 0,
      easing: "ease",
      iterations: 1,
      fill: "both",
      direction: "normal",
    });
  });
});

describe("authored animation fill (end-to-end stream)", () => {
  test("authored `pan_right` reaches the renderer with inherited fill: both", async () => {
    const harness = await runInstant(
      `  [[show backdrop BG]]\n  [[animate backdrop with pan_right]]`,
    );
    const anim = findAnimateAnimation(harness);
    expect(anim.$name).toBe("pan_right");
    expect(anim.timing.fill).toBe("both");
    expect(Array.isArray(anim.keyframes)).toBe(true);
    expect(anim.keyframes).toHaveLength(1);
  });

  test("builtin with explicit fill: none is left unchanged (shake)", async () => {
    const harness = await runInstant(
      `  [[show backdrop BG]]\n  [[animate backdrop with shake]]`,
    );
    const anim = findAnimateAnimation(harness);
    expect(anim.$name).toBe("shake");
    expect(anim.timing.fill).toBe("none");
  });
});
