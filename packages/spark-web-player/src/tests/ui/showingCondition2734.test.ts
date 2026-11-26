import { describe, expect, test, vi } from "vitest";
import type { Clock } from "../../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../../spark-engine/src/game/core/classes/Coordinator";
import { anchorSelfTargeted, getCSSSelector, getStyleContent } from "@impower/spark-dom/src/utils/getStyleContent";
import {
  AT_RULE_STATES,
  NTH_OF_PSEUDO_CLASSES,
  SELECTOR_LIST_PSEUDO_CLASSES,
  writeSparkleSelector,
  writeSparkleSelectorChecked,
} from "../../../../sparkle-style-transformer/src/utils/sparkleSelector";
import { writeSparkleSelector as writeBaseSelector } from "./sparkleSelectorBase2734.fixture";
import { getComponents, parseSparkle, renderCssVDOM } from "../../../../sparkle-screen-renderer/src";
import { sparkleSelectorToCssSelector } from "../../../../sparkle-screen-renderer/src/runtime/css";
import { createScreenRenderContext } from "../../../../sparkle-screen-preview/src/utils/createScreenRenderContext";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";

const ACTION = ':where([data-showing~="action"]) &';

const written = (selector: string) => anchorSelfTargeted(getCSSSelector(selector, {}));

describe("@showing(name) compiles to a mark on the game's root (#2734)", () => {
  test("alone, it tests the root's data-showing for the name", () => {
    expect(written("@showing(action)")).toBe(ACTION);
    expect(written("@showing( action )")).toBe(ACTION);
    expect(written("@showing(menu@pause)")).toBe(':where([data-showing~="menu@pause"]) &');
  });

  test("beside another state on either side, the state stays on the styled element", () => {
    expect(written("@showing(action) @hovered")).toBe(`${ACTION}:hover`);
    expect(written("@hovered @showing(action)")).toBe(`${ACTION}:hover`);
    expect(written("@showing(action) >> name")).toBe(`${ACTION} .name`);
  });

  test("two conditions, and @theme on either side, join on the same root", () => {
    expect(written("@showing(action) @showing(hud)")).toBe(':where([data-showing~="action"][data-showing~="hud"]) &');
    expect(written("@theme(dark) @showing(action)")).toBe(
      ':where([data-color-scheme="dark"][data-showing~="action"]) &',
    );
    expect(written("@showing(action) @theme(dark)")).toBe(
      ':where([data-color-scheme="dark"][data-showing~="action"]) &',
    );
  });

  test("each selector in a list keeps its own condition", () => {
    expect(written("@showing(action), @showing(dialogue)")).toBe(
      ':where([data-showing~="action"]) &, :where([data-showing~="dialogue"]) &',
    );
  });

  test("the screen preview writes the same condition", () => {
    expect(writeSparkleSelector("@showing(action)", { breakpoints: {}, colorScheme: "media" })).toBe(ACTION);
  });

  test("a written argument that is not one name is left as written, so it never applies", () => {
    expect(written("@showing(a b)")).toBe("@showing(a b)");
  });

  test("a refused block writes no rule, and the style's other blocks are kept", () => {
    const css = getStyleContent(
      {
        frame: {
          opacity: "0.5",
          "@not(@showing(action))": { opacity: "1" },
          "icon > @showing(action)": { opacity: "0.25" },
          "@showing(action)": { opacity: "0.75" },
        },
      },
      { breakpoints: {}, theme: {} as never },
    );
    expect(css).toContain('[data-showing~="action"]');
    expect(css).not.toContain(":not(");
    expect(css).not.toContain(".icon");
    expect(css).not.toContain("@showing");
    expect(css).toContain("opacity: 0.5");
    expect(css).toContain("opacity: 0.75");
    expect(css).not.toContain("opacity: 1;");
    expect(css).not.toContain("opacity: 0.25");
  });

  describe("every selector-taking state, at-rule prelude and combinator refuses the condition", () => {
    const inside = [...SELECTOR_LIST_PSEUDO_CLASSES, ...NTH_OF_PSEUDO_CLASSES].flatMap((state) =>
      ["@", ":"].map((prefix) =>
        NTH_OF_PSEUDO_CLASSES.includes(state)
          ? `${prefix}${state}(1 of @showing(action))`
          : `${prefix}${state}(@showing(action))`,
      ),
    );
    const preludes = [...AT_RULE_STATES.keys()].map((rule) =>
      rule === "supports" ? `@supports selector(frame @showing(action))` : `@${rule} (frame @showing(action))`,
    );
    const combinators = [">", "+", "~", ">>"].map((combinator) => `icon ${combinator} @showing(action)`);
    test.each([...inside, ...preludes, ...combinators])("%s", (selector) => {
      const { refusals } = writeSparkleSelectorChecked(selector, { breakpoints: {}, colorScheme: "attribute" });
      expect(refusals).toHaveLength(1);
      expect(selector.slice(refusals[0]!.from, refusals[0]!.to)).toBe("@showing(action)");
      expect(sparkleSelectorToCssSelector(selector, {})).toBeUndefined();
    });
  });

  describe("the first compound lifts the condition to a selector that matches in the DOM", () => {
    const frameUnder = (showing?: string) => {
      const root = document.createElement("div");
      if (showing) {
        root.setAttribute("data-showing", showing);
      }
      root.innerHTML = '<span class="frame"><i class="name"></i></span>';
      return root;
    };
    test.each([
      ["@showing(action)", ".frame"],
      ["@first @showing(action)", ".frame"],
      ["@showing(action) @first", ".frame"],
      ["@showing(action) @showing(hud)", ".frame"],
      ["@showing(action) >> name", ".name"],
    ])("%s", (selector, target) => {
      const { css, refusals } = writeSparkleSelectorChecked(selector, { breakpoints: {}, colorScheme: "attribute" });
      expect(refusals).toEqual([]);
      const rule = anchorSelfTargeted(css).replaceAll("&", ".frame");
      expect(frameUnder().querySelector(target)!.matches(rule)).toBe(false);
      expect(frameUnder("action hud").querySelector(target)!.matches(rule)).toBe(true);
    });
  });

  describe("a block nested under other keys is judged by its joined key, in the game and in the screen preview", () => {
    const styled = (outer: string, inner: string) =>
      getStyleContent(
        { frame: { "icon > badge": { opacity: "0.5" }, [outer]: { [inner]: { opacity: "0.75" } } } },
        { breakpoints: { sm: 640 }, theme: {} as never },
      );
    const previewed = (outer: string, inner: string) => {
      const parsed = parseSparkle(
        ["style frame", "  icon > badge", "    opacity = 0.5", `  ${outer}`, `    ${inner}`, "      opacity = 0.75"].join(
          "\n",
        ),
      );
      return JSON.stringify(renderCssVDOM(parsed, createScreenRenderContext(getComponents(parsed), {}, new Set())));
    };
    test.each([
      ["> icon", "@showing(action)"],
      ["icon + badge", "@showing(action) @hovered"],
      [">> name", "@showing(action)"],
      ["icon, > badge", "@showing(action)"],
    ])("under %s, %s writes no rule", (outer, inner) => {
      for (const css of [styled(outer, inner), previewed(outer, inner)]) {
        expect(css).toContain("0.5");
        expect(css).not.toContain("data-showing");
        expect(css).not.toContain("0.75");
      }
    });
    test.each([
      ["@hovered", "@showing(action)"],
      ["icon", "@showing(action)"],
      ["@screen-size(sm)", "@showing(action)"],
    ])("under %s, %s writes its rule", (outer, inner) => {
      for (const css of [styled(outer, inner), previewed(outer, inner)]) {
        expect(css).toContain("data-showing~=");
        expect(css).toContain("0.75");
      }
    });
  });

  test("keys with @theme and no @showing write exactly what the base writer writes", () => {
    const corpus = [
      "@theme(dark)",
      "@theme(light) @hovered",
      "@hovered @theme(dark)",
      "@theme(dark) >> child",
      "@theme(dark), @theme(light)",
      "@theme(dark) @theme(light)",
      "@not(@theme(dark))",
      ":not(@theme(dark))",
      "@has(icon @theme(dark))",
      "icon > @theme(dark)",
      "@theme(darkness)",
      "@screen-size(sm) @theme(dark)",
      "@first @theme(dark)",
      '[title="@theme(dark)"] @theme(light)',
    ];
    for (const colorScheme of ["attribute", "media"] as const) {
      for (const selector of corpus) {
        const options = { breakpoints: { sm: 640 }, colorScheme };
        expect(writeSparkleSelector(selector, options), `${colorScheme} ${selector}`).toBe(
          writeBaseSelector(selector, options),
        );
      }
    }
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

describe("a layout and an element named with @ alternates (#2734)", () => {
  test("are marked under their full names", async () => {
    const source = `define ui as config with
  layouts_initial = { "menu@pause" }
end

layout menu@pause {
  badge@night {
    text "Status"
  }
}

style frame {
  @showing(menu@pause) { opacity = 1 }
  @showing(badge@night) { opacity = 1 }
}

scene start
  Hello.
end
`;
    const h = createDOMHarness(source, 0, { reactive: true, autoOpenAll: false });
    try {
      await h.ready;
      await flushMicrotasks(10);
      h.jumpTo("start");
      await showBeat(h);
      expect(h.overlay.getAttribute("data-showing")).toBe("badge@night menu@pause");
    } finally {
      h.ui.onDispose();
    }
  });
});

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
      await ui.text.change("line replace", ["dialogue"]);
      await ui.text.change("line write", "action", [{ text: "New action.", after: 0.1 }], false, 1100);
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

  test("a layout reopened by the waiting beat is unmarked between the old one's removal and that beat", async () => {
    await heldBeat(async (h, ui, timeline) => {
      expect(ui.beginCompose()).toBe(true);
      await ui.closeLayout("notice", { with: "fadeout", over: 0.5 });
      await ui.endCompose();
      await flushMicrotasks(30);
      const [retiring] = [...ui._retiring];
      expect(retiring).toBeDefined();
      timeline.currentTime = 1000;
      expect(ui.beginCompose()).toBe(true);
      await ui.openLayout("notice");
      await ui.text.change("line replace", ["dialogue"]);
      await ui.text.change("line write", "action", [{ text: "New action.", after: 0.1 }], false, 1100);
      await ui.endCompose({ time: 1100 });
      await flushMicrotasks(30);
      expect((h.overlay as any).__sdBeat).toBeDefined();
      ui.retire(retiring);
      await flushMicrotasks(30);
      expect((h.overlay as any).__sdBeat).toBeDefined();
      expect(h.overlay.querySelector(".notice")).toBeNull();
      expect(h.overlay.getAttribute("data-showing")).toBe("dialogue");
      await commitHeldBeat(h, timeline);
      expect(h.overlay.getAttribute("data-showing")).toBe("action notice");
    });
  }, 60_000);

  test("a layout the waiting beat opened and closed is not marked when that beat shows after its removal", async () => {
    await heldBeat(async (h, ui, timeline) => {
      timeline.currentTime = 1000;
      expect(ui.beginCompose()).toBe(true);
      await ui.openLayout("banner");
      await ui.closeLayout("banner", { with: "fadeout", over: 0.5 });
      await ui.text.change("line replace", ["dialogue"]);
      await ui.text.change("line write", "action", [{ text: "New action.", after: 0.1 }], false, 1100);
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
