import { describe, expect, test, vi } from "vitest";
import type { Clock } from "../../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../../spark-engine/src/game/core/classes/Coordinator";
import { anchorSelfTargeted, getCSSSelector } from "@impower/spark-dom/src/utils/getStyleContent";
import { writeSparkleSelector } from "../../../../sparkle-style-transformer/src/utils/sparkleSelector";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";

const ACTION = ':where([data-showing~="action"]) &';

const written = (selector: string) => anchorSelfTargeted(getCSSSelector(selector, {}));

describe("@showing(name) compiles to a mark on the game's root (#2734)", () => {
  test("alone, it tests the root's data-showing for the name", () => {
    expect(written("@showing(action)")).toBe(ACTION);
    expect(written("@showing( action )")).toBe(ACTION);
  });

  test("nested with another state on either side, the state stays on the styled element", () => {
    expect(written("@showing(action) @hovered")).toBe(`${ACTION}:hover`);
    expect(written("@hovered @showing(action)")).toBe(`${ACTION}:hover`);
    expect(written("@showing(action) >> name")).toBe(`${ACTION} .name`);
  });

  test("it joins @theme and another @showing on the same root", () => {
    expect(written("@theme(dark) @showing(action)")).toBe(
      ':where([data-color-scheme="dark"][data-showing~="action"]) &',
    );
    expect(written("@showing(action) @showing(hud)")).toBe(
      ':where([data-showing~="action"][data-showing~="hud"]) &',
    );
  });

  test("each selector in a list keeps its own condition", () => {
    expect(written("@showing(action), @showing(dialogue)")).toBe(
      ':where([data-showing~="action"]) &, :where([data-showing~="dialogue"]) &',
    );
  });

  test("inside @not and @is it keeps the function's meaning", () => {
    const root = document.createElement("div");
    root.innerHTML = '<span class="frame"></span>';
    const frame = root.querySelector(".frame")!;
    const on = (selector: string) => frame.matches(written(selector).replaceAll("&", ".frame"));
    expect(written("@not(@showing(action))")).toBe('&:not([data-showing~="action"] *)');
    expect(written("@is(@showing(action), @showing(dialogue))")).toBe(
      '&:is([data-showing~="action"] *, [data-showing~="dialogue"] *)',
    );
    expect(on("@not(@showing(action))")).toBe(true);
    expect(on("@is(@showing(action), @showing(dialogue))")).toBe(false);
    root.setAttribute("data-showing", "action");
    expect(on("@not(@showing(action))")).toBe(false);
    expect(on("@is(@showing(action), @showing(dialogue))")).toBe(true);
    root.setAttribute("data-showing", "dialogue");
    expect(on("@is(@showing(action), @showing(dialogue))")).toBe(true);
    expect(on("@not(@showing(action)) @hovered")).toBe(false);
  });

  test("the screen preview writes the same condition", () => {
    expect(writeSparkleSelector("@showing(action)", { breakpoints: {}, colorScheme: "media" })).toBe(ACTION);
  });

  test("a written argument that is not one name is left as written, so it never applies", () => {
    expect(written("@showing(a b)")).toBe("@showing(a b)");
  });
});

const SOURCE = `define HERO as character with
  name = "HERO"
end

define ui as config with
  layouts_initial = { "textbox", "hud" }
end

layout hud {
  frame {
    text = HUD
  }
}

style frame {
  @showing(action) {
    background-color = neutral_95
  }
}

scene start
  HERO:
    Hello.
  The door opens.
  HERO:
    Bye.
end
`;

const FRAME_UNDER_ACTION = ':where([data-showing~="action"]) .frame';

async function showBeat(h: DOMHarness) {
  const beat = h.nextBeat();
  expect(beat).toBeDefined();
  new Coordinator(h.game, beat!).onUpdate({ deltaMS: 0 } as Clock);
  await flushMicrotasks(30);
}

const stylesheet = (h: DOMHarness) =>
  [...h.overlay.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n");

describe("a style under @showing(action) applies in another layout (#2734)", () => {
  test("the hud's frame matches while an action line shows, and stops matching when dialogue replaces it", async () => {
    const h = createDOMHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    await flushMicrotasks(10);
    h.jumpTo("start");
    await showBeat(h);
    const frame = h.overlay.querySelector(".hud .frame");
    const action = h.overlay.querySelector(".textbox .action");
    expect(frame).not.toBeNull();
    expect(action).not.toBeNull();
    expect(frame!.closest(".hud")).not.toBe(action!.closest(".textbox"));
    expect(stylesheet(h)).toContain(`${ACTION} {`);
    expect(h.overlay.hasAttribute("data-showing")).toBe(false);
    expect(h.overlay.querySelector(FRAME_UNDER_ACTION)).toBeNull();

    await showBeat(h);
    expect(action!.textContent).toContain("The door opens.");
    expect(h.overlay.getAttribute("data-showing")).toBe("action");
    expect(h.overlay.querySelector(FRAME_UNDER_ACTION)).toBe(frame);

    await showBeat(h);
    expect(h.overlay.hasAttribute("data-showing")).toBe(false);
    expect(h.overlay.querySelector(FRAME_UNDER_ACTION)).toBeNull();
  });
});

const STYLED = (inline: string, styles: string) => `define ui as config with
  layouts_initial = { "overlay", "hud" }
end

layout overlay {
  badge ${inline} {
    text "Status"
  }
}

layout hud {
  frame {
    text "HUD"
  }
}

style frame {
  @showing(badge) { opacity = 0.5 }
}

${styles}

scene start
  Hello.
end
`;

describe("styling an element does not change whether it is showing (#2734)", () => {
  test.each([
    ["a style block", "", "style badge { display = none }"],
    ["an inline prop", "#display=none", ""],
  ])("a badge hidden by %s stays marked", async (_way, inline, styles) => {
    const h = createDOMHarness(STYLED(inline, styles), 0, { reactive: true, autoOpenAll: false });
    try {
      await h.ready;
      await flushMicrotasks(10);
      h.jumpTo("start");
      await showBeat(h);
      expect(h.overlay.querySelector(".badge")?.textContent).toContain("Status");
      expect(h.overlay.getAttribute("data-showing")).toBe("badge");
    } finally {
      h.ui.onDispose();
    }
  });
});

const RETIRING = `define HERO as character with
  name = "HERO"
end

define ui as config with
  layouts_initial = { "textbox", "notice" }
end

layout notice {
  text "Leaving"
}

layout banner {
  text "Arriving"
}

style frame {
  @showing(action) { opacity = 1 }
  @showing(dialogue) { opacity = 1 }
  @showing(notice) { opacity = 1 }
  @showing(banner) { opacity = 1 }
}

scene start
  HERO:
    Old dialogue.
end
`;

type Timeline = { currentTime: number };

async function heldBeat(run: (h: DOMHarness, ui: any, timeline: Timeline) => Promise<void>) {
  const h = createDOMHarness(RETIRING, 0, { reactive: true, compose: true, autoOpenAll: false });
  await h.ready;
  await h.preview(RETIRING.split("\n").findIndex((line) => line.includes("Old dialogue.")));
  h.game.module.ui.sweepReconcile();
  await flushMicrotasks(30);
  const ui: any = h.game.module.ui;
  h.game.context.system.previewing = undefined;
  const receive = h.ui.onReceiveRequest.bind(h.ui);
  h.ui.onReceiveRequest = ((message: any) =>
    message.method === "ui/animate" ? new Promise(() => {}) : receive(message)) as any;
  const timeline = h.overlay.ownerDocument.timeline as unknown as Timeline;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    await run(h, ui, timeline);
  } finally {
    h.ui.onDispose();
    vi.useRealTimers();
    timeline.currentTime = 0;
  }
}

async function commitHeldBeat(h: DOMHarness, timeline: Timeline) {
  timeline.currentTime = 1200;
  vi.advanceTimersByTime(200);
  await flushMicrotasks(30);
  expect((h.overlay as any).__sdBeat).toBeUndefined();
}

describe("a layout removed while a later beat waits to show (#2734)", () => {
  test("the root keeps the shown beat's names, less the removed layout, until the waiting beat shows", async () => {
    await heldBeat(async (h, ui, timeline) => {
      expect(h.overlay.getAttribute("data-showing")).toBe("dialogue notice");
      expect(ui.beginCompose()).toBe(true);
      await ui.closeLayout("notice", { with: "fadeout", over: 0.5 });
      await ui.endCompose();
      await flushMicrotasks(30);
      const [retiring] = [...ui._retiring];
      expect(retiring).toBeDefined();
      timeline.currentTime = 1000;
      expect(ui.beginCompose()).toBe(true);
      await ui.text.clear("dialogue");
      await ui.text.write("action", [{ text: "New action.", after: 0.1 }], false, 1100);
      await ui.endCompose({ time: 1100 });
      await flushMicrotasks(30);
      expect((h.overlay as any).__sdBeat).toBeDefined();
      expect(h.overlay.getAttribute("data-showing")).toBe("dialogue notice");
      ui.retire(retiring);
      await flushMicrotasks(30);
      expect((h.overlay as any).__sdBeat).toBeDefined();
      expect(h.overlay.querySelector(".notice")).toBeNull();
      expect(h.overlay.querySelector(".dialogue")?.textContent).toContain("Old dialogue.");
      expect(h.overlay.getAttribute("data-showing")).toBe("dialogue");
      await commitHeldBeat(h, timeline);
      expect(h.overlay.getAttribute("data-showing")).toBe("action");
    });
  }, 60_000);

  test("a layout the waiting beat opened and closed is not marked when that beat shows after its removal", async () => {
    await heldBeat(async (h, ui, timeline) => {
      timeline.currentTime = 1000;
      expect(ui.beginCompose()).toBe(true);
      await ui.openLayout("banner");
      await ui.closeLayout("banner", { with: "fadeout", over: 0.5 });
      await ui.text.clear("dialogue");
      await ui.text.write("action", [{ text: "New action.", after: 0.1 }], false, 1100);
      await ui.endCompose({ time: 1100 });
      await flushMicrotasks(30);
      expect((h.overlay as any).__sdBeat).toBeDefined();
      const [retiring] = [...ui._retiring];
      expect(retiring?.name).toBe("banner");
      ui.retire(retiring);
      await flushMicrotasks(30);
      expect(h.overlay.getAttribute("data-showing")).toBe("dialogue notice");
      await commitHeldBeat(h, timeline);
      expect(h.overlay.getAttribute("data-showing")).toBe("action notice");
    });
  }, 60_000);
});
