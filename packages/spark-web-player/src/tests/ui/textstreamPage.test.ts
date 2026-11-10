import { afterEach, describe, expect, test, vi } from "vitest";
import type { Clock } from "../../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../../spark-engine/src/game/core/classes/Coordinator";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";

const OPEN_TEXTSTREAM = `define ui as config with
  layouts_initial = { "textstream" }
end
`;

const STORY = `${OPEN_TEXTSTREAM}
define MARA as character with
  name = "MARA"
end

scene start
  The train rattles on.
  MARA: Did you hear that?
  MARA: Something is *wrong*.
  The lights flicker.
end
`;

async function showBeats(h: DOMHarness, count: number) {
  h.jumpTo("start");
  for (let i = 0; i < count; i += 1) {
    const beat = h.nextBeat();
    expect(beat).toBeDefined();
    const coordinator = new Coordinator(h.game, beat!);
    coordinator.onUpdate({ deltaMS: 0 } as Clock);
    await flushMicrotasks(30);
  }
}

function scroller(h: DOMHarness): HTMLElement {
  const el = h.overlay.querySelector<HTMLElement>(".layout_textstream .textstream");
  expect(el, h.overlay.innerHTML).not.toBeNull();
  return el!;
}

const domEvent = (el: HTMLElement, type: string) =>
  new (el.ownerDocument.defaultView as any).Event(type) as Event;

function fakeScroll(el: HTMLElement, clientHeight = 100) {
  let top = 0;
  const content = () => el.querySelector(".textstream_column")?.children.length ?? 0;
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => clientHeight });
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => 60 * content() });
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = Math.max(0, Math.min(value, 60 * content() - clientHeight));
    },
  });
  const calls: ScrollToOptions[] = [];
  (el as any).scrollTo = (options: ScrollToOptions) => {
    calls.push(options);
    el.scrollTop = options.top ?? 0;
    el.dispatchEvent(domEvent(el, "scroll"));
  };
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the player renders the Interactive Fiction page (#1990)", () => {
  test("each beat is an entry in the column: italic narration, a named dialogue line, then the same speaker unnamed", async () => {
    const h = createDOMHarness(STORY, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    await showBeats(h, 3);
    const column = scroller(h).querySelector(".textstream_column")!;
    const entries = [...column.children].map((el) => ({
      class: el.className,
      name: el.querySelector(".textstream_name")?.textContent ?? null,
      text: el.querySelector(":scope > .text")?.textContent ?? "",
    }));
    expect(entries).toEqual([
      { class: "textstream_action", name: null, text: "The train rattles on." },
      { class: "textstream_dialogue", name: "MARA", text: "Did you hear that?" },
      { class: "textstream_dialogue", name: null, text: "Something is wrong." },
    ]);
    const emphasised = [...column.children[2]!.querySelectorAll<HTMLElement>(".text_letter")]
      .filter((letter) => letter.style.fontStyle === "italic")
      .map((letter) => letter.textContent)
      .join("");
    expect(emphasised).toBe("wrong");
  });

  test("the page follows the newest entry, stops while the reader is scrolled up, and resumes at the bottom", async () => {
    const h = createDOMHarness(STORY, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    await showBeats(h, 1);
    const el = scroller(h);
    const calls = fakeScroll(el);
    h.jumpTo("start");
    h.nextBeat();
    for (const count of [2, 3]) {
      const coordinator = new Coordinator(h.game, h.nextBeat()!);
      coordinator.onUpdate({ deltaMS: 0 } as Clock);
      await flushMicrotasks(30);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(el.scrollTop).toBe(60 * count - 100);
    }
    expect(calls.at(-1)?.behavior).toBe("smooth");

    el.dispatchEvent(domEvent(el, "wheel"));
    el.scrollTop = 0;
    el.dispatchEvent(domEvent(el, "scroll"));
    const next = new Coordinator(h.game, h.nextBeat()!);
    next.onUpdate({ deltaMS: 0 } as Clock);
    await flushMicrotasks(30);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(el.scrollTop).toBe(0);

    el.dispatchEvent(domEvent(el, "wheel"));
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(domEvent(el, "scroll"));
    h.game.module.ui.page.record("more", false, (before) => ({
      keep: before.length,
      entries: [{ kind: "caption", caption: "Sound: door_slam" }],
    }));
    h.game.module.ui.page.show(true);
    await flushMicrotasks(30);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(el.scrollTop).toBe(el.scrollHeight - 100);
  });

  test("it moves without smooth scrolling under prefers-reduced-motion", async () => {
    const h = createDOMHarness(STORY, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    (window as any).matchMedia = (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
    });
    await showBeats(h, 1);
    const el = scroller(h);
    const calls = fakeScroll(el);
    const coordinator = new Coordinator(h.game, h.nextBeat()!);
    coordinator.onUpdate({ deltaMS: 0 } as Clock);
    await flushMicrotasks(30);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.behavior === "auto")).toBe(true);
    delete (window as any).matchMedia;
  });
});

describe("a game restyles the page through its colour roles (#1990)", () => {
  test("redefining paper and ink changes the colours the page's root is drawn in", async () => {
    const stylesheet = async (source: string) => {
      const h = createDOMHarness(source, 0, { reactive: true, autoOpenAll: false });
      await h.ready;
      await showBeats(h, 1);
      const root = scroller(h);
      const css = [...h.overlay.querySelectorAll("style")]
        .map((style) => style.textContent ?? "")
        .join("\n");
      const rule = (cls: string) =>
        css.slice(css.indexOf(`#game .${cls} {`), css.indexOf("}", css.indexOf(`#game .${cls} {`)));
      expect(root.classList.contains("paper")).toBe(true);
      expect(root.classList.contains("ink")).toBe(true);
      return { paper: rule("paper"), ink: rule("ink") };
    };
    const builtin = await stylesheet(STORY);
    expect(builtin.paper).toContain("--theme-color-neutral_99");
    expect(builtin.ink).toContain("--theme-color-slate_20");
    const restyled = await stylesheet(`${STORY}
style paper {
  background-color = slate_10
}

style ink {
  text-color = slate_95
}
`);
    expect(restyled.paper).toContain("--theme-color-slate_10");
    expect(restyled.paper).not.toContain("neutral_99");
    expect(restyled.ink).toContain("--theme-color-slate_95");
  });
});
