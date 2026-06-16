// Golden-master: image show / hide / transition / layered / animate.
//
// Locks the CURRENT engine image realization: `image.write` builds web DOM in
// the engine (an `instance` span carrying `background_image: url(...)` + a
// child `img` object), reveals it via `ui/animate`, and on a subsequent
// `show` hides + destroys the previous layer (the crossfade). §9.1.2 of the
// reactive spec proposes shipping `ImageInstruction[]` and realizing this
// renderer-side; until then, THIS stream is the baseline.

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFS = `define BG as image with
  src = "https://example.com/bg.png"
end

define BG2 as image with
  src = "https://example.com/bg2.png"
end

define SPRITE as image with
  src = "https://example.com/hero.png"
end

define SHADOW as image with
  src = "https://example.com/shadow.png"
end

screen main with
  stage:
    backdrop:
      image
    portrait:
      image
end
`;

function story(body: string) {
  return `${DEFS}\n-> start\n\nscene start\n${body}\nend\n`;
}

// Drive every queued beat (instant) and snapshot the resulting ui/* stream.
async function runInstant(body: string) {
  const harness = createHarness(story(body));
  await harness.ready;
  harness.jumpTo("start");
  harness.reset();
  let beat = harness.nextBeat();
  while (beat) {
    await harness.display(beat, true);
    await flushMicrotasks();
    beat = harness.nextBeat();
  }
  return harness;
}

describe("image", () => {
  test("show backdrop", async () => {
    const harness = await runInstant(`  [[show backdrop BG]]`);
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("hide backdrop", async () => {
    const harness = await runInstant(`  [[show backdrop BG]]\n  [[hide backdrop]]`);
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("show then re-show (crossfade: hide+destroy previous layer)", async () => {
    const harness = await runInstant(
      `  [[show backdrop BG]]\n  [[show backdrop BG2]]`,
    );
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("show with fade transition", async () => {
    const harness = await runInstant(`  [[show backdrop BG with fade]]`);
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("animated (non-instant) show emits per-layer animate", async () => {
    const harness = createHarness(story(`  [[show backdrop BG]]`));
    await harness.ready;
    harness.jumpTo("start");
    harness.reset();
    const beat = harness.nextBeat();
    await harness.display(beat!, /* instant */ false);
    await flushMicrotasks();
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("layered images (multi-asset SPRITE+SHADOW) stack background_image", async () => {
    const harness = await runInstant(`  [[show portrait SPRITE+SHADOW]]`);
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("image animate directive", async () => {
    const harness = await runInstant(
      `  [[show portrait SPRITE]]\n  [[animate portrait with shake]]`,
    );
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });
});
