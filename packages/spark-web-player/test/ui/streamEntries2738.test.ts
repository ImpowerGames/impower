import { afterEach, describe, expect, test, vi } from "vitest";
import type { Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../spark-engine/src/game/core/classes/Coordinator";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const STORY = `define RAFFLES as character with
  name = "RAFFLES"
end

define BUNNY as character with
  name = "BUNNY"
end

layout phone {
  thread {
    stream {
      dialogue.bubble { text }
    }
  }
}

style bubble {
  @latest { opacity = 1 }
}

scene start
  [[open phone]]
  RAFFLES: slight problem
  RAFFLES: doors locked
  BUNNY: Anything you can do about it?
end
`;

async function showNext(h: DOMHarness) {
  const beat = h.nextBeat();
  expect(beat).toBeDefined();
  const coordinator = new Coordinator(h.game, beat!);
  coordinator.onUpdate({ deltaMS: 0 } as Clock);
  await flushMicrotasks(30);
}

const entriesOf = (h: DOMHarness) => {
  const stream = h.overlay.querySelector<HTMLElement>(".phone > .thread > .stream");
  expect(stream, h.overlay.innerHTML).not.toBeNull();
  return [...stream!.children] as HTMLElement[];
};

const textOf = (entry: HTMLElement) =>
  entry.querySelector(":scope > .text")?.textContent ?? "";

describe("the player draws a stream's entries (#2738)", () => {
  test("each line appends an entry and keeps the earlier entries' nodes; @latest is on the newest only", async () => {
    const h = createDOMHarness(STORY, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");

    await showNext(h);
    const first = entriesOf(h);
    expect(first.map(textOf)).toEqual(["slight problem"]);
    expect(first.map((el) => el.className)).toEqual(["dialogue bubble"]);
    expect(first.map((el) => el.hasAttribute("data-latest"))).toEqual([true]);

    await showNext(h);
    const second = entriesOf(h);
    expect(second.map(textOf)).toEqual(["slight problem", "doors locked"]);
    expect(second[0]).toBe(first[0]);
    expect(second.map((el) => el.hasAttribute("data-latest"))).toEqual([false, true]);

    await showNext(h);
    const third = entriesOf(h);
    expect(third.map(textOf)).toEqual([
      "slight problem",
      "doors locked",
      "Anything you can do about it?",
    ]);
    expect(third.slice(0, 2)).toEqual(second);
    expect(third.map((el) => el.hasAttribute("data-latest"))).toEqual([false, false, true]);

    const css = [...h.overlay.querySelectorAll("style")]
      .map((style) => style.textContent ?? "")
      .join("\n");
    expect(css).toMatch(/#game \.bubble \{\s*&\[data-latest\] \{\s*opacity: 1/);
  });

  test("the stream and the element around it follow the newest entry", async () => {
    const h = createDOMHarness(STORY, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    await showNext(h);
    const stream = h.overlay.querySelector<HTMLElement>(".phone .stream")!;
    expect(stream.getAttribute("data-follow")).toBe("end");
    expect(stream.parentElement!.getAttribute("data-follow")).toBe("end");
  });

  test("a stream written with a class and props keeps them, and still follows its newest entry", async () => {
    const source = STORY.replace(
      "    stream {",
      "    stream.feed #height=44px #overflow=scroll {",
    ).replace(
      "style bubble {",
      "style feed {\n  background-color = red\n  overflow-y = auto\n  pointer-events = auto\n}\n\nstyle bubble {",
    );
    const h = createDOMHarness(source, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    await showNext(h);
    const stream = h.overlay.querySelector<HTMLElement>(".phone > .thread > .stream")!;
    expect(stream.className).toBe("stream feed");
    expect(stream.style.height).toBe("44px");
    expect(stream.style.overflow).toBe("scroll");
    expect(stream.getAttribute("data-follow")).toBe("end");
    expect(entriesOf(h).map(textOf)).toEqual(["slight problem"]);
    const css = [...h.overlay.querySelectorAll("style")]
      .map((style) => style.textContent ?? "")
      .join("\n");
    const feed = css.slice(css.indexOf("#game .feed {"), css.indexOf("}", css.indexOf("#game .feed {")));
    expect(feed).toContain("background-color");
    expect(feed).toContain("overflow-y: auto");
    expect(feed).toContain("pointer-events: auto");
  });

  test("a template named exactly like the box's element keeps every entry's text while the box changes line", async () => {
    const h = createDOMHarness(STORY.replace("dialogue.bubble { text }", "dialogue { text }"), 0, {
      reactive: true,
      autoOpenAll: false,
    });
    await h.ready;
    h.jumpTo("start");
    await showNext(h);
    await showNext(h);
    await showNext(h);
    expect(entriesOf(h).map(textOf)).toEqual([
      "slight problem",
      "doors locked",
      "Anything you can do about it?",
    ]);
    const box = [...h.overlay.querySelectorAll<HTMLElement>(".dialogue")].filter(
      (el) => !el.closest(".stream"),
    );
    expect(box.map((el) => el.textContent ?? "").join("|")).toContain(
      "Anything you can do about it?",
    );
  });

  test("a style written to a template's name reaches the entries", async () => {
    const h = createDOMHarness(STORY, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    await showNext(h);
    await showNext(h);
    h.game.module.ui.style.update("bubble", { opacity: "0.25" });
    await flushMicrotasks(30);
    expect(entriesOf(h).map((el) => el.style.opacity)).toEqual(["0.25", "0.25"]);
  });

  test("a clear followed by the same line draws a new entry rather than keeping the old one", async () => {
    const source = STORY.replace(
      "  RAFFLES: doors locked\n",
      "  [[clear phone]] RAFFLES: slight problem\n",
    );
    const h = createDOMHarness(source, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    await showNext(h);
    const before = entriesOf(h);
    await showNext(h);
    const after = entriesOf(h);
    expect(after.map(textOf)).toEqual(["slight problem"]);
    expect(after[0]).not.toBe(before[0]);
  });

  test("an entry whose condition changes keeps its own line in the new branch, and stays the latest", async () => {
    const source = `define RAFFLES as character with
  name = "RAFFLES"
end

store expanded = true

function toggle()
  expanded = not expanded
end

layout phone {
  stream {
    dialogue.bubble {
      if expanded then
        text.first
      else
        text.second
      end
    }
  }
}

scene start
  [[open phone]] RAFFLES: first message
  RAFFLES: second message
end
`;
    const h = createDOMHarness(source, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    await showNext(h);
    await showNext(h);
    const entries = () => [...h.overlay.querySelectorAll<HTMLElement>(".phone > .stream > .bubble")];
    const texts = () => entries().map((el) => el.querySelector(".text")?.textContent ?? "");
    expect(texts()).toEqual(["first message", "second message"]);
    const before = entries();
    (h.game.story as any).EvaluateFunction("toggle", []);
    h.game.module.ui.refreshLayouts();
    await flushMicrotasks(30);
    expect(entries()).toEqual(before);
    expect(h.overlay.querySelectorAll(".phone .second")).toHaveLength(2);
    expect(texts()).toEqual(["first message", "second message"]);
    expect(entries().map((el) => el.hasAttribute("data-latest"))).toEqual([false, true]);
  });

  test("with the textbox and a stream both open, a line shows in both", async () => {
    const h = createDOMHarness(STORY, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    await showNext(h);
    await showNext(h);
    const box = [...h.overlay.querySelectorAll<HTMLElement>(".dialogue")].filter(
      (el) => !el.closest(".stream"),
    );
    expect(box.length).toBeGreaterThan(0);
    expect(box.map((el) => el.textContent ?? "").join("|")).toContain("doors locked");
    expect(entriesOf(h).map(textOf)).toEqual(["slight problem", "doors locked"]);
  });
});

const TOGGLED = (body: string) => `define RAFFLES as character with
  name = "RAFFLES"
end

store expanded = true

function toggle()
  expanded = not expanded
end

layout phone {
  stream {
    dialogue.bubble {
      ${body}
    }
  }
}

scene start
  [[open phone]] RAFFLES: first message
  RAFFLES: second message
end
`;

const TEXT_BRANCH = `if expanded then
        text.first
      else
        text.second
      end`;

const LABEL_BRANCH = `text
      if expanded then
        label.first "expanded"
      else
        label.second "collapsed"
      end`;

describe("a reactive change while an entry is typing (#2738)", () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
    vi.useRealTimers();
  });

  test.each([
    ["the text child is remounted, beats not composed", TEXT_BRANCH, false, false],
    ["a label beside the text is remounted, beats not composed", LABEL_BRANCH, false, false],
    ["the text child is remounted, beats composed", TEXT_BRANCH, true, false],
    ["a label beside the text is remounted, beats composed", LABEL_BRANCH, true, false],
    ["the entries were restored at once first, beats not composed", TEXT_BRANCH, false, true],
    ["the entries were restored at once first, beats composed", TEXT_BRANCH, true, true],
  ])("keeps the line's reveal where it was: %s", async (_label, body, composed, restored) => {
    const h = createDOMHarness(TOGGLED(body), 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    await showNext(h);
    expect(h.overlay.querySelector(".phone .bubble .text")?.textContent).toBe("first message");
    const g = globalThis as any;
    const previous = {
      Animation: g.Animation,
      KeyframeEffect: g.KeyframeEffect,
      getComputedStyle: g.getComputedStyle,
    };
    const win = h.overlay.ownerDocument.defaultView!;
    g.getComputedStyle = win.getComputedStyle.bind(win);
    g.Animation = TimedAnimation;
    g.KeyframeEffect = TimedEffect;
    Object.defineProperty(h.overlay.ownerDocument, "timeline", {
      configurable: true,
      value: timeline,
    });
    timeline.currentTime = 0;
    animations.length = 0;
    restore = () => {
      g.Animation = previous.Animation;
      g.KeyframeEffect = previous.KeyframeEffect;
      g.getComputedStyle = previous.getComputedStyle;
      animations.length = 0;
    };
    (h.game.context.system as any).previewing = undefined;
    (h.game.context.system as any).composeBeats = composed;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    h.ui.onUpdate({ elapsedTime: 0 } as never);
    const coordinator = new Coordinator(h.game, h.nextBeat()!);
    for (let i = 0; i < 10; i += 1) {
      coordinator.onUpdate({ deltaMS: 0 } as Clock);
      await flushMicrotasks(40);
    }
    timeline.currentTime = 100;
    vi.advanceTimersByTime(100);
    for (const animation of animations) {
      animation.update();
    }
    await flushMicrotasks(40);
    const letters = () => [
      ...h.overlay.querySelectorAll<HTMLElement>(".phone .bubble:last-child .text .text_letter"),
    ];
    const visible = () =>
      letters().filter((letter) => {
        const reveal = (letter as any).__sdReveal;
        return reveal
          ? reveal.currentTime != null &&
              reveal.currentTime >= Number(reveal.effect.timing.delay ?? 0)
          : letter.style.opacity === "1";
      }).length;
    expect(h.overlay.querySelectorAll(".phone .bubble")).toHaveLength(2);
    const typed = visible();
    expect(typed).toBeGreaterThan(0);
    expect(typed).toBeLessThan(letters().length);
    if (restored) {
      h.game.module.ui.streams.restore();
      h.game.module.ui.streams.show(false);
      await flushMicrotasks(40);
      for (const animation of animations) {
        animation.update();
      }
      expect(visible()).toBe(letters().length);
    }
    const before = visible();

    (h.game.story as any).EvaluateFunction("toggle", []);
    h.game.module.ui.refreshLayouts();
    await flushMicrotasks(40);
    expect(h.overlay.querySelectorAll(".phone .second")).toHaveLength(2);
    expect(h.overlay.querySelector(".phone .bubble:last-child")?.hasAttribute("data-latest")).toBe(true);
    expect(visible()).toBe(before);
  });
});
