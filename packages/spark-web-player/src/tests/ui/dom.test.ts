import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SCREEN = `define HERO as character with
  name = "HERO"
end

define BG as image with
  src = "https://example.com/bg.png"
end

layout main with
  stage {
    backdrop {
      image
    }
  }
  textbox {
    character_info {
      character_name {
        text
      }
    }
    dialogue {
      text
    }
  }
end
`;

function story(body: string) {
  return `${SCREEN}\n\n\nscene start\n${body}\nend\n`;
}

describe("dom render", () => {
  test("screen tree renders into overlay", async () => {
    const harness = createDOMHarness(story(`  Hi.`));
    await harness.ready;
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });

  test("dialogue line renders per-glyph text spans", async () => {
    const harness = createDOMHarness(story(`  HERO: Hi.`));
    await harness.ready;
    harness.jumpTo("start");
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });

  test("image show renders background span + img", async () => {
    const harness = createDOMHarness(story(`  [[show backdrop BG]]`));
    await harness.ready;
    harness.jumpTo("start");
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });

  test("inline-styled dialogue (bold) sets font-weight on the styled span", async () => {
    const harness = createDOMHarness(story(`  HERO: This is **bold**.`));
    await harness.ready;
    harness.jumpTo("start");
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });
});

const IMAGE_SCREEN = `define BG as image with
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

layout main with
  stage {
    backdrop {
      image
    }
    portrait {
      image
    }
  }
end
`;

function imageStory(body: string) {
  return `${IMAGE_SCREEN}\n\n\nscene start\n${body}\nend\n`;
}

async function runImageBeats(body: string) {
  const harness = createDOMHarness(imageStory(body));
  await harness.ready;
  harness.jumpTo("start");
  let beat = harness.nextBeat();
  while (beat) {
    await harness.display(beat, true);
    await flushMicrotasks();
    beat = harness.nextBeat();
  }
  return harness;
}

describe("dom render · image lifecycle", () => {
  test("image hide clears the backdrop layer", async () => {
    const harness = await runImageBeats(
      `  [[show backdrop BG]]\n  [[hide backdrop]]`,
    );
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });

  test("crossfade: show BG then BG2 leaves only the new layer", async () => {
    const harness = await runImageBeats(
      `  [[show backdrop BG]]\n  [[show backdrop BG2]]`,
    );
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });

  test("layered images stack background-image on one span", async () => {
    const harness = await runImageBeats(`  [[show portrait SPRITE+SHADOW]]`);
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });

  test("image animate keeps the shown layer", async () => {
    const harness = await runImageBeats(
      `  [[show portrait SPRITE]]\n  [[animate portrait with shake]]`,
    );
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });

  test("asset-bearing hide destroys its transient layer (no leak)", async () => {
    const shown = await runImageBeats(`  [[show backdrop BG]]`);
    const shownCount =
      shown.overlay.querySelectorAll(".backdrop .instance").length;
    const hidden = await runImageBeats(
      `  [[show backdrop BG]]\n  [[hide backdrop BG]]`,
    );
    expect(
      hidden.overlay.querySelectorAll(".backdrop .instance").length,
    ).toBe(shownCount);
    expect(hidden.snapshotDOM()).toMatchSnapshot();
  });
});

const CHOICE_SCREEN = `layout main with
  dialogue {
    text
  }
  choice.0 {
    text
  }
  choice.1 {
    text
  }
end
`;

const CHOICE_STORY = `${CHOICE_SCREEN}


scene start
  Pick:
  choose
    + (a) Apple
      Chose apple.
      -> DONE
    + (b) Banana
      Chose banana.
      -> DONE
  end
end
`;

describe("dom render · choices + real click", () => {
  test("choices render into overlay", async () => {
    const harness = createDOMHarness(CHOICE_STORY);
    await harness.ready;
    harness.jumpTo("start");
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });

  test("a real DOM click on a choice clears the choices", async () => {
    const harness = createDOMHarness(CHOICE_STORY);
    await harness.ready;
    harness.jumpTo("start");
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();

    const choiceEl = harness.overlay.querySelector(
      "[image], .choice, [class*='choice']",
    ) as HTMLElement | null;
    const clickable =
      choiceEl ??
      (Array.from(harness.overlay.querySelectorAll("*")).find((el) =>
        (el as HTMLElement).className?.split(" ").includes("choice"),
      ) as HTMLElement | undefined);
    expect(clickable).toBeTruthy();
    const win = harness.overlay.ownerDocument.defaultView!;
    clickable!.dispatchEvent(
      new win.MouseEvent("click", { bubbles: true, button: 0 }),
    );
    await flushMicrotasks();
    expect(harness.snapshotDOM()).toMatchSnapshot();
  });
});
