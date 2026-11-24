import { describe, expect, test } from "vitest";
import type { Clock } from "../../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../../spark-engine/src/game/core/classes/Coordinator";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";

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
