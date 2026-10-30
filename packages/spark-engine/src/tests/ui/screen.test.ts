import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SCREEN = `layout main with
  stage {
    backdrop {
      image
    }
    portrait {
      mask.shadow_1
      image
    }
  }
  textbox {
    character_info {
      character_name {
        text
      }
      character_parenthetical {
        text
      }
    }
    dialogue {
      stroke
      text
    }
    continue_indicator
  }
end
`;

const STORY = `${SCREEN}\n-> start\n\nscene start\n  Hi.\nend\n`;

describe("screen", () => {
  test("screen tree construction (full ui/create stream at connect)", async () => {
    const harness = createHarness(STORY);
    await harness.ready;
    expect(harness.snapshotWire("ui/")).toMatchSnapshot();
  });

  test("hide then show screen toggles hidden attribute", async () => {
    const harness = createHarness(STORY);
    await harness.ready;
    harness.reset();
    harness.game.module.ui.hideLayout("main");
    harness.game.module.ui.showLayout("main");
    await flushMicrotasks();
    expect(harness.snapshotWire("ui/")).toMatchSnapshot();
  });
});
