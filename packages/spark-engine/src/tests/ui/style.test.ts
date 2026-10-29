import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

const SOURCE = `style dialogue with
  height = 100%
  @screen-size(sm) {
    width = 100%
  }
  > text {
    color = black
    font_size = 3cqh
  }
end

style dialogue_background with
  background_image = image.ui_dialogue_box
  position = absolute
  aspect_ratio = 1341/381
end

define ui_dialogue_box as image with
  src = "https://example.com/box.png"
end

define accent as color with
  value = "rgb(10,20,30)"
end

layout main with
  textbox {
    dialogue {
      text
    }
  }
end

-> start

scene start
  Hi.
end
`;

describe("style", () => {
  test("style + variables construction stream", async () => {
    const harness = createHarness(SOURCE);
    await harness.ready;
    const styleCreates = harness
      .snapshotFiltered("ui/create")
      .filter((m: any) => String(m.params?.name ?? "").startsWith("style-"));
    expect(styleCreates).toMatchSnapshot();
  });

  test("authored style block content payload", async () => {
    const harness = createHarness(SOURCE);
    await harness.ready;
    const stylesEl = harness
      .snapshotFiltered("ui/create")
      .find((m: any) => m.params?.name === "style-styles") as any;
    expect(stylesEl?.params?.content).toMatchSnapshot();
  });
});
