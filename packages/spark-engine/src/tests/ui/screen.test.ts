// Golden-master: screen construction (the structural element tree) and
// screen show / hide.
//
// `connect()`'s onConnected calls `constructScreens()`, which walks
// `context.screen.<name>` and emits the `ui/create` tree (named structural
// elements as nested divs; `text`/`stroke` → span content; `image`/`mask` →
// background spans). `showScreen`/`hideScreen` toggle the `hidden` attribute.
// This locks the full creation stream + the visibility toggles.

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SCREEN = `screen main with
  stage:
    backdrop:
      image
    portrait:
      mask shadow_1
      image
  textbox:
    character_info:
      character_name:
        text
      character_parenthetical:
        text
    dialogue:
      stroke
      text
    continue_indicator
end
`;

const STORY = `${SCREEN}\n-> start\n\nscene start\n  Hi.\nend\n`;

describe("screen", () => {
  test("screen tree construction (full ui/create stream at connect)", async () => {
    const harness = createHarness(STORY);
    await harness.ready;
    // The whole captured stream IS the construction (styles + screen tree).
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("hide then show screen toggles hidden attribute", async () => {
    const harness = createHarness(STORY);
    await harness.ready;
    harness.reset();
    harness.game.module.ui.hideScreen("main");
    harness.game.module.ui.showScreen("main");
    await flushMicrotasks();
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });
});
