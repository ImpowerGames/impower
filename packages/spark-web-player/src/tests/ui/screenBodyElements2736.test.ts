import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SOURCE = `screen menu {
  panel {
    header { text "My Game" }
    slot
  }
}

layout home in menu {
  home_page { text "Title" }
}

layout options in menu {
  options_page { text "Settings" }
}

scene start
  [[navigate menu to home]] One.
  [[navigate menu to options]] Two.
  [[close options]] Three.
end
`;

describe("a screen's shared element in the player", () => {
  test("keeps its DOM node while the screen's layouts swap", async () => {
    const h = createDOMHarness(SOURCE, 0, {
      reactive: true,
      autoOpenAll: false,
    });
    await h.ready;
    h.jumpTo("start");
    const step = async () => {
      const beat = h.nextBeat()!;
      for (const events of Object.values(beat.layout ?? {})) {
        await h.game.module.ui.applyLayoutInstructions(events, true);
      }
      await h.display(beat, true);
      await flushMicrotasks(20);
    };

    await step();
    const header = h.overlay.querySelector(".menu > .panel > .header");
    expect(header?.textContent).toBe("My Game");
    expect(h.overlay.querySelector(".panel > .home > .home_page")).toBeTruthy();

    await step();
    expect(h.overlay.querySelector(".menu > .panel > .header")).toBe(header);
    expect(h.overlay.querySelectorAll(".header").length).toBe(1);
    expect(h.overlay.querySelector(".home")).toBeNull();
    expect(
      h.overlay.querySelector(".panel > .options > .options_page"),
    ).toBeTruthy();

    await step();
    expect(h.overlay.querySelector(".header")).toBeNull();
    expect(h.overlay.querySelector(".options")).toBeNull();
  });
});
