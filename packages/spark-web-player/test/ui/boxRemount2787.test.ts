import { afterEach, describe, expect, test, vi } from "vitest";
import type { Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../spark-engine/src/game/core/classes/Coordinator";
import { EventMessage } from "../../../spark-engine/src/game/core/classes/messages/EventMessage";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";
import { BEAT_LEAD_MS } from "../../../spark-engine/src/game/core/utils/sharedClock";
import { AudioClock } from "../../src/app/AudioClock";
import { advanceTo, timeline, useTimedAnimations } from "./timedAnimation";

const source = (body: string) => `define RAFFLES as character with
  name = "RAFFLES"
end

store expanded = true

function toggle()
  expanded = not expanded
end

layout main {
  ${body}
}

scene start
  [[open main]] RAFFLES: slight problem
  RAFFLES: doors locked
end
`;

const BOX = `dialogue {
    if expanded then
      text.first
    else
      text.second
    end
  }`;

async function next(h: DOMHarness) {
  const beat = h.nextBeat();
  expect(beat).toBeDefined();
  const coordinator = new Coordinator(h.game, beat!);
  for (let i = 0; i < 10; i += 1) {
    coordinator.onUpdate({ deltaMS: 0 } as Clock);
    await flushMicrotasks(40);
  }
  return coordinator;
}

const texts = (h: DOMHarness) =>
  [...h.overlay.querySelectorAll<HTMLElement>(".main .dialogue .text")].map(
    (el) => `${el.classList.contains("second") ? "second" : "first"}=${el.textContent ?? ""}`,
  );

async function toggle(h: DOMHarness) {
  h.game.story.EvaluateFunction("toggle", []);
  h.game.module.ui.refreshLayouts();
  await flushMicrotasks(40);
}

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
  vi.useRealTimers();
});

function timed(h: DOMHarness) {
  restore = useTimedAnimations(h);
}

const at = advanceTo;

const letters = (h: DOMHarness) => [
  ...h.overlay.querySelectorAll<HTMLElement>(".main .dialogue .text .text_letter"),
];

const visible = (h: DOMHarness) =>
  letters(h).filter((el) => {
    const reveal = (el as any).__sdReveal;
    return reveal
      ? reveal.currentTime != null &&
          reveal.currentTime >= Number(reveal.effect.timing.delay ?? 0)
      : el.style.opacity === "1";
  }).length;

describe("a box's text across a remount of its content (#2787)", () => {
  test("the branch an if change mounts shows the line the box was showing", async () => {
    const h = createDOMHarness(source(BOX), 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    await next(h);
    expect(texts(h)).toEqual(["first=slight problem"]);
    await toggle(h);
    expect(texts(h)).toEqual(["second=slight problem"]);
    await toggle(h);
    expect(texts(h)).toEqual(["first=slight problem"]);
    await next(h);
    expect(texts(h)).toEqual(["first=doors locked"]);
    await toggle(h);
    expect(texts(h)).toEqual(["second=doors locked"]);
  });

  test("a box nested under a remounted branch receives its line", async () => {
    const h = createDOMHarness(
      source(`if expanded then
    wrapper.first {
      dialogue { text }
    }
  else
    wrapper.second {
      dialogue { text }
    }
  end`),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    await next(h);
    expect(texts(h)).toEqual(["first=slight problem"]);
    await toggle(h);
    expect(h.overlay.querySelector(".main .wrapper.second .dialogue")).not.toBeNull();
    expect(texts(h)).toEqual(["first=slight problem"]);
  });

  test("the line being typed keeps its reveal across a remount and a click then finishes it", async () => {
    const h = createDOMHarness(source(BOX), 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    timed(h);
    const coordinator = await next(h);
    await at(100);
    const before = visible(h);
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(letters(h).length);
    await toggle(h);
    expect(texts(h)).toEqual(["second=slight problem"]);
    expect(visible(h)).toBe(before);
    coordinator.onMessage(
      EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
    );
    coordinator.onUpdate({ deltaMS: 0 } as Clock);
    await flushMicrotasks(40);
    expect(visible(h)).toBe(letters(h).length);
  });

  test("a box whose layout a screen branch rehosts keeps its line", async () => {
    const h = createDOMHarness(
      source(`dialogue {
    text
  }`).replace(
        "layout main {",
        "screen shell {\n  if expanded then\n    panel.first { slot }\n  else\n    panel.second { slot }\n  end\n}\n\nlayout main in shell {",
      ),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    await next(h);
    expect(texts(h)).toEqual(["first=slight problem"]);
    await toggle(h);
    expect(h.overlay.querySelector(".shell .panel.second .main .dialogue")).not.toBeNull();
    expect(texts(h)).toEqual(["first=slight problem"]);
  });

  test("a text slot a for loop adds receives the box's line, and a sibling with its own words keeps them", async () => {
    const h = createDOMHarness(
      source(`dialogue {
    for row in rows do
      text
    end
    if expanded then
      text "NOTE"
    end
  }`).replace("store expanded = true", "store expanded = false\n\nstore rows = { 1 }\n\nfunction grow()\n  rows = { 1, 2 }\nend"),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    await next(h);
    expect(texts(h)).toEqual(["first=slight problem"]);
    h.game.story.EvaluateFunction("grow", []);
    h.game.module.ui.refreshLayouts();
    await flushMicrotasks(40);
    expect(texts(h)).toEqual(["first=slight problem", "first=slight problem"]);
    await toggle(h);
    expect(texts(h)).toEqual(["first=slight problem", "first=slight problem", "first=NOTE"]);
  });

  test("a line appended after a restore is kept once across a remount", async () => {
    const h = createDOMHarness(source(BOX), 0, { reactive: true });
    await h.ready;
    const ui = h.game.module.ui;
    await ui.text.change("line write", "dialogue", [{ text: "A" }], true);
    await ui.onRestore();
    await ui.text.change("line write", "dialogue", [{ text: "B" }], true);
    expect(texts(h)).toEqual(["first=AB"]);
    await toggle(h);
    expect(texts(h)).toEqual(["second=AB"]);
  });

  test("a write that repeats everything the box shows is appended", async () => {
    const h = createDOMHarness(source(BOX), 0, { reactive: true });
    await h.ready;
    const ui = h.game.module.ui;
    const a = { text: "A", style: { color: "red" } };
    const b = { text: "B" };
    await ui.text.change("line write", "dialogue", [a], true);
    await ui.text.change("line write", "dialogue", [b], true);
    expect(texts(h)).toEqual(["first=AB"]);
    await ui.text.change("line write", "dialogue", [a, b], true);
    expect(texts(h)).toEqual(["first=ABAB"]);
  });

  test.each([false, true])(
    "a line paused and resumed while typing keeps its reveal across a remount (beats composed: %s)",
    async (composed) => {
      const h = createDOMHarness(source(BOX), 0, { reactive: true, autoOpenAll: false });
      await h.ready;
      h.jumpTo("start");
      timed(h);
      (h.game.context.system as any).composeBeats = composed;
      await next(h);
      await at(100);
      const before = visible(h);
      expect(before).toBeGreaterThan(0);
      expect(before).toBeLessThan(letters(h).length);
      h.ui.onPause();
      await at(1100);
      h.ui.onUnpause();
      expect(visible(h)).toBe(before);
      if (composed) {
        expect(h.game.module.ui.beginCompose()).toBe(true);
      }
      h.game.story.EvaluateFunction("toggle", []);
      h.game.module.ui.refreshLayouts();
      if (composed) {
        void h.game.module.ui.endCompose({});
      }
      await flushMicrotasks(40);
      expect(texts(h)).toEqual(["second=slight problem"]);
      expect(visible(h)).toBe(before);
    },
  );

  test("a line finished by a click stays finished across a remount", async () => {
    const h = createDOMHarness(source(BOX), 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    timed(h);
    const coordinator = await next(h);
    await at(100);
    coordinator.onMessage(
      EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
    );
    coordinator.onUpdate({ deltaMS: 0 } as Clock);
    await flushMicrotasks(40);
    expect(visible(h)).toBe(letters(h).length);
    await toggle(h);
    await at(timeline.currentTime);
    expect(texts(h)).toEqual(["second=slight problem"]);
    expect(visible(h)).toBe(letters(h).length);
  });
});

describe("a box marked #clear stays cleared across a remount of its element (#2787)", () => {
  const boxes = (h: DOMHarness) =>
    Object.fromEntries(
      ["back", "gone"].map((name) => [
        name,
        [...h.overlay.querySelectorAll<HTMLElement>(`.main .dialogue.${name} > .text`)].map(
          (el) => el.textContent ?? "",
        ),
      ]),
    );

  const PAIR = `dialogue.back {
      text
    }
    dialogue.gone #clear {
      text
    }`;

  async function cleared(h: DOMHarness) {
    await h.ready;
    h.jumpTo("start");
    await next(h);
    await h.game.module.ui.text.change("line clear", ["dialogue"]);
    await flushMicrotasks(40);
  }

  async function refresh(h: DOMHarness, fn: string) {
    h.game.story.EvaluateFunction(fn, []);
    h.game.module.ui.refreshLayouts();
    await flushMicrotasks(40);
  }

  test("an if branch remounted twice", async () => {
    const h = createDOMHarness(
      source(`if expanded then
    ${PAIR}
  end`),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await cleared(h);
    expect(boxes(h)).toEqual({ back: ["slight problem"], gone: [""] });
    await toggle(h);
    expect(boxes(h)).toEqual({ back: [], gone: [] });
    await toggle(h);
    expect(boxes(h)).toEqual({ back: ["slight problem"], gone: [""] });
  });

  test("a layout its screen rehosts", async () => {
    const h = createDOMHarness(
      source(PAIR).replace(
        "layout main {",
        "screen shell {\n  if expanded then\n    panel.first { slot }\n  else\n    panel.second { slot }\n  end\n}\n\nlayout main in shell {",
      ),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await cleared(h);
    expect(boxes(h)).toEqual({ back: ["slight problem"], gone: [""] });
    await toggle(h);
    expect(h.overlay.querySelector(".shell .panel.second .main")).not.toBeNull();
    expect(boxes(h)).toEqual({ back: ["slight problem"], gone: [""] });
  });

  test("a for loop that gains an iteration", async () => {
    const h = createDOMHarness(
      source(`for row in rows do
    ${PAIR}
  end`).replace(
        "store expanded = true",
        "store expanded = true\n\nstore rows = { 1 }\n\nfunction grow()\n  rows = { 1, 2 }\nend",
      ),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await cleared(h);
    expect(boxes(h)).toEqual({ back: ["slight problem"], gone: [""] });
    await refresh(h, "grow");
    expect(boxes(h)).toEqual({
      back: ["slight problem", "slight problem"],
      gone: ["", ""],
    });
  });
});

describe("a line still typing keeps its reveal when the whole box is replaced (#2787)", () => {
  const shown = (h: DOMHarness) =>
    [...h.overlay.querySelectorAll<HTMLElement>(".main .dialogue .text_letter")]
      .filter((el) => {
        const reveal = (el as any).__sdReveal;
        return reveal
          ? reveal.currentTime != null &&
              reveal.currentTime >= Number(reveal.effect.timing.delay ?? 0)
          : el.style.opacity === "1";
      })
      .map((el) => el.textContent)
      .join("");

  test.each([
    [
      "an if branch",
      source(`if expanded then
    dialogue.first {
      text
    }
  else
    dialogue.second {
      text
    }
  end`),
    ],
    [
      "a screen slot",
      source(`dialogue {
    text
  }`).replace(
        "layout main {",
        "screen shell {\n  if expanded then\n    panel.first { slot }\n  else\n    panel.second { slot }\n  end\n}\n\nlayout main in shell {",
      ),
    ],
  ])("after a pause and resume, when %s replaces it", async (_name, story) => {
    const h = createDOMHarness(story, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    timed(h);
    await next(h);
    await at(100);
    const before = shown(h);
    expect(before.length).toBeGreaterThan(0);
    expect(before.length).toBeLessThan("slight problem".length);
    h.ui.onPause();
    await at(1100);
    h.ui.onUnpause();
    expect(shown(h)).toBe(before);
    await toggle(h);
    expect(shown(h)).toBe(before);
  });

  test("in a box limited to the line's speaker", async () => {
    const h = createDOMHarness(
      source(`dialogue #speaker=raffles {
    if expanded then
      text.first
    else
      text.second
    end
  }`),
      0,
      { reactive: true },
    );
    await h.ready;
    timed(h);
    const ui = h.game.module.ui;
    ui.line({ speaker: { character: "raffles" }, text: { dialogue: [] } } as any);
    void ui.text.change(
      "line write",
      "dialogue",
      [..."slight problem"].map((text, i) => ({ text, after: i * 0.05 })),
      false,
      20,
    );
    await flushMicrotasks(40);
    await at(100);
    const before = shown(h);
    expect(before.length).toBeGreaterThan(0);
    expect(before.length).toBeLessThan("slight problem".length);
    await toggle(h);
    expect(h.overlay.querySelector(".main .dialogue .text.second")?.textContent).toBe(
      "slight problem",
    );
    expect(shown(h)).toBe(before);
  });
});

describe("a typing line's resume position in the cases round 3 left open (#2787)", () => {
  const typed = (text: string) => [...text].map((t, i) => ({ text: t, after: i * 0.05 }));

  const shownIn = (h: DOMHarness, box: string) =>
    [...h.overlay.querySelectorAll<HTMLElement>(`.main .${box} .text_letter`)]
      .filter((el) => {
        const reveal = (el as any).__sdReveal;
        return reveal
          ? reveal.currentTime != null &&
              reveal.currentTime >= Number(reveal.effect.timing.delay ?? 0)
          : el.style.opacity === "1";
      })
      .map((el) => el.textContent)
      .join("");

  test("two boxes written the same line at the same time each keep their reveal across a pause and a remount of one", async () => {
    const h = createDOMHarness(
      source(`dialogue {
    if expanded then
      text.first
    else
      text.second
    end
  }
  action {
    text
  }`),
      0,
      { reactive: true },
    );
    await h.ready;
    timed(h);
    const ui = h.game.module.ui;
    void ui.text.change("line write", "dialogue", typed("slight problem"), false, 20);
    void ui.text.change("line write", "action", typed("slight problem"), false, 20);
    await flushMicrotasks(40);
    await at(100);
    const dialogue = shownIn(h, "dialogue");
    const action = shownIn(h, "action");
    expect(dialogue.length).toBeGreaterThan(0);
    expect(dialogue.length).toBeLessThan("slight problem".length);
    expect(action).toBe(dialogue);
    h.ui.onPause();
    await at(1100);
    h.ui.onUnpause();
    await toggle(h);
    expect(h.overlay.querySelector(".main .dialogue .text.second")?.textContent).toBe(
      "slight problem",
    );
    expect(shownIn(h, "dialogue")).toBe(dialogue);
    expect(shownIn(h, "action")).toBe(action);
    await at(1200);
    expect(shownIn(h, "dialogue")).toBe(shownIn(h, "action"));
  });

  test.each([
    ["ends with", "ab", "ab"],
    ["contains", "xaby", "ab"],
  ])(
    "a box limited to the speaker whose earlier text %s the typing write's characters resumes after them",
    async (_name, earlier, current) => {
      const h = createDOMHarness(
        source(`dialogue #speaker=raffles {
    if expanded then
      text.first
    else
      text.second
    end
  }`),
        0,
        { reactive: true },
      );
      await h.ready;
      timed(h);
      const ui = h.game.module.ui;
      ui.line({ speaker: { character: "raffles" }, text: { dialogue: [] } } as any);
      await ui.text.change("line write", "dialogue", [{ text: earlier }], true);
      void ui.text.change("line write", "dialogue", typed(current), false, 20);
      await flushMicrotasks(40);
      await at(40);
      const before = shownIn(h, "dialogue");
      expect(before.startsWith(earlier)).toBe(true);
      expect(before.length).toBeLessThan(earlier.length + current.length);
      await toggle(h);
      expect(h.overlay.querySelector(".main .dialogue .text.second")?.textContent).toBe(
        earlier + current,
      );
      expect(shownIn(h, "dialogue")).toBe(before);
    },
  );

  test("in a composed beat, a box that has accumulated two writes shows both after its slot is replaced", async () => {
    const h = createDOMHarness(source(BOX), 0, { reactive: true });
    await h.ready;
    const ui = h.game.module.ui;
    await ui.text.change("line write", "dialogue", [{ text: "A" }], true);
    await ui.text.change("line write", "dialogue", [{ text: "B" }], true);
    expect(texts(h)).toEqual(["first=AB"]);
    (h.game.context.system as any).composeBeats = true;
    expect(ui.beginCompose()).toBe(true);
    h.game.story.EvaluateFunction("toggle", []);
    ui.refreshLayouts();
    void ui.endCompose({});
    await flushMicrotasks(40);
    expect(texts(h)).toEqual(["second=AB"]);
  });
});

describe("a typing line keeps its reveal across a pause, however it is rewritten (#2787)", () => {
  const typed = (text: string) => [...text].map((t, i) => ({ text: t, after: i * 0.05 }));

  const BRANCH = `if expanded then
      text.first
    else
      text.second
    end`;

  const SCREEN =
    "screen shell {\n  if expanded then\n    panel.first { slot }\n  else\n    panel.second { slot }\n  end\n}\n\nlayout main in shell {";

  const story = (mode: string, limit: string) => {
    if (mode === "box") {
      return source(`if expanded then
    dialogue.first${limit} {
      text
    }
  else
    dialogue.second${limit} {
      text
    }
  end`);
    }
    if (mode === "screen") {
      return source(`dialogue${limit} {
    text
  }`).replace("layout main {", SCREEN);
    }
    if (mode === "loop") {
      return source(`dialogue${limit} {
    for row in rows do
      text
    end
  }`)
        .replace("store expanded = true", "store expanded = true\n\nstore rows = { 1 }")
        .replace("  expanded = not expanded", "  expanded = not expanded\n  rows = { 1, 2 }");
    }
    return source(`dialogue${limit} {
    ${BRANCH}
  }`);
  };

  const shown = (h: DOMHarness) =>
    [...h.overlay.querySelectorAll<HTMLElement>(".main .dialogue .text_letter")]
      .filter((el) => {
        const reveal = (el as any).__sdReveal;
        return reveal
          ? reveal.currentTime != null &&
              reveal.currentTime >= Number(reveal.effect.timing.delay ?? 0)
          : el.style.opacity === "1";
      })
      .map((el) => el.textContent)
      .join("");

  test.each(
    ["slot", "box", "screen", "loop"].flatMap((mode) =>
      ["", " #speaker=raffles", " #variant=aside"].map((limit) => [mode, limit]),
    ),
  )("after an earlier complete write, when the %s is replaced (limit:%s)", async (mode, limit) => {
    const h = createDOMHarness(story(mode, limit), 0, { reactive: true });
    await h.ready;
    timed(h);
    const ui = h.game.module.ui;
    ui.line({ speaker: { character: "raffles" }, variant: "aside", text: { dialogue: [] } } as any);
    await ui.text.change("line write", "dialogue", [{ text: "prefix " }], true);
    void ui.text.change("line write", "dialogue", typed("slight problem"), false, 20);
    await flushMicrotasks(40);
    await at(100);
    const before = shown(h);
    expect(before.length).toBeGreaterThan("prefix ".length);
    expect(before.length).toBeLessThan("prefix slight problem".length);
    h.ui.onPause();
    await at(1100);
    h.ui.onUnpause();
    expect(shown(h)).toBe(before);
    await toggle(h);
    expect(shown(h)).toBe(mode === "loop" ? before + before : before);
  });

  test("after the line waited for its box to arrive", async () => {
    const h = createDOMHarness(
      source(`dialogue {
    ${BRANCH}
  }`).replace(
        "layout main {",
        "style dialogue {\n  opacity = 1\n  @initial { opacity = 0 }\n  @show { transition-duration = 280ms }\n}\n\nlayout main {",
      ),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    timed(h);
    h.game.context.system.now = () => timeline.currentTime;
    (h.game.context.system as any).composeBeats = true;
    await next(h);
    await at(400);
    await at(500);
    const before = shown(h);
    expect(before.length).toBeGreaterThan(0);
    expect(before.length).toBeLessThan("slight problem".length);
    h.ui.onPause();
    await at(1500);
    h.ui.onUnpause();
    expect(shown(h)).toBe(before);
    await toggle(h);
    expect(shown(h)).toBe(before);
  });

  test("after many other typed writes", async () => {
    const h = createDOMHarness(
      source(`dialogue {
    ${BRANCH}
  }
  action {
    text
  }`),
      0,
      { reactive: true },
    );
    await h.ready;
    timed(h);
    const ui = h.game.module.ui;
    void ui.text.change("line write", "dialogue", typed("slight problem"), false, 20);
    await flushMicrotasks(40);
    await at(100);
    const before = shown(h);
    expect(before.length).toBeGreaterThan(0);
    expect(before.length).toBeLessThan("slight problem".length);
    h.ui.onPause();
    await at(1100);
    h.ui.onUnpause();
    for (let i = 0; i < 100; i += 1) {
      void ui.text.change("line write", "action", typed(`message ${i}`), false, 1120 + i);
    }
    await flushMicrotasks(40);
    await toggle(h);
    expect(shown(h)).toBe(before);
  });
});

describe("a replayed line resumes where a line never replayed has got to (#2787)", () => {
  const typed = (text: string) => [...text].map((t, i) => ({ text: t, after: i * 0.05 }));

  const PAIR = source(`dialogue {
    if expanded then
      text.first
    else
      text.second
    end
  }
  action {
    text
  }`);

  const shownIn = (h: DOMHarness, box: string) =>
    [...h.overlay.querySelectorAll<HTMLElement>(`.main .${box} .text_letter`)].filter((el) => {
      const reveal = (el as any).__sdReveal;
      return reveal
        ? reveal.currentTime != null &&
            reveal.currentTime >= Number(reveal.effect.timing.delay ?? 0)
        : el.style.opacity === "1";
    }).length;

  const same = (h: DOMHarness) => {
    expect(shownIn(h, "dialogue")).toBe(shownIn(h, "action"));
    return shownIn(h, "action");
  };

  async function pair(
    h: DOMHarness,
    time: number,
    sequence: { text: string; after?: number }[] = typed("slight problem"),
    shown = 0,
  ) {
    const ui = h.game.module.ui;
    void ui.text.change("line write", "dialogue", sequence, false, time, shown);
    void ui.text.change("line write", "action", sequence, false, time, shown);
    await flushMicrotasks(40);
  }

  async function opened(origin = 0) {
    const h = createDOMHarness(PAIR, 0, { reactive: true });
    await h.ready;
    timed(h);
    if (origin !== 0) {
      (h.ui as any).app.audioClock = new AudioClock(origin, () => origin);
    }
    return h;
  }

  const pause = async (h: DOMHarness, from: number, to: number) => {
    await at(from);
    h.ui.onPause();
    await at(to);
    h.ui.onUnpause();
  };

  test("two pauses after the start", async () => {
    const h = await opened();
    await pair(h, 20);
    await pause(h, 60, 400);
    await pause(h, 450, 900);
    await at(950);
    await toggle(h);
    const now = same(h);
    expect(now).toBeGreaterThan(0);
    expect(now).toBeLessThan("slight problem".length);
    await at(1100);
    same(h);
  });

  test("a start in the future, with no pause, is left where it is", async () => {
    const h = await opened();
    await pause(h, 10, 60);
    await at(100);
    await pair(h, 100 + BEAT_LEAD_MS);
    await at(100 + BEAT_LEAD_MS + 100);
    expect(shownIn(h, "action")).toBe(3);
    await toggle(h);
    expect(same(h)).toBe(3);
  });

  test("on a clock whose origin is not zero", async () => {
    const origin = 1_700_000_000_000;
    const h = await opened(origin);
    await pause(h, 10, 60);
    await at(100);
    await pair(h, origin + 100 + BEAT_LEAD_MS);
    await at(100 + BEAT_LEAD_MS + 100);
    expect(shownIn(h, "action")).toBe(3);
    await pause(h, 230, 730);
    await toggle(h);
    expect(same(h)).toBe(3);
  });

  test("a replay delivered while paused", async () => {
    const h = await opened();
    await pair(h, 20);
    await at(100);
    h.ui.onPause();
    await at(400);
    await toggle(h);
    const held = same(h);
    expect(held).toBeGreaterThan(0);
    expect(held).toBeLessThan("slight problem".length);
    await at(900);
    expect(same(h)).toBe(held);
    h.ui.onUnpause();
    await at(1000);
    same(h);
  });

  test("a shown reveal, whose first instructions show at once", async () => {
    const h = await opened();
    await pair(h, 20, [{ text: "prefix " }, ...typed("slight problem")], 1);
    await pause(h, 100, 1100);
    await toggle(h);
    expect(h.overlay.querySelector(".main .dialogue .text.second")?.textContent).toBe(
      "prefix slight problem",
    );
    const now = same(h);
    expect(now).toBeGreaterThan(0);
    expect(now).toBeLessThan("slight problem".length);
  });

  const atMostOneAhead = (replay: number, live: number) => {
    expect(replay).toBeGreaterThanOrEqual(live);
    expect(replay).toBeLessThanOrEqual(live + 1);
  };

  test("limit: a pause that spans the line's start within the engine's lead leaves a replay at most one letter ahead, never behind", async () => {
    const h = await opened();
    await at(100);
    await pair(h, 100 + BEAT_LEAD_MS);
    await pause(h, 110, 600);
    await at(700);
    const live = shownIn(h, "action");
    expect(live).toBeGreaterThan(0);
    expect(live).toBeLessThan("slight problem".length);
    await toggle(h);
    expect(shownIn(h, "action")).toBe(live);
    atMostOneAhead(shownIn(h, "dialogue"), live);
  });

  test("limit: a pending beat shifted past the pause that held it leaves a replay at most one letter ahead, never behind", async () => {
    const h = createDOMHarness(source(BOX), 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    timed(h);
    h.game.context.system.now = () => timeline.currentTime;
    (h.game.context.system as any).composeBeats = true;
    h.ui.onPause();
    await next(h);
    await at(500);
    h.ui.onUnpause();
    await at(500 + BEAT_LEAD_MS + 75);
    const live = visible(h);
    expect(live).toBeGreaterThan(0);
    expect(live).toBeLessThan("slight problem".length);
    await toggle(h);
    expect(texts(h)).toEqual(["second=slight problem"]);
    atMostOneAhead(visible(h), live);
  });

  test("limit: a line the line wait releases after a pause during its box's arrival leaves a replay at most one letter ahead, never behind", async () => {
    const h = createDOMHarness(
      source(`dialogue {
    if expanded then
      text.first
    else
      text.second
    end
  }`).replace(
        "layout main {",
        "style dialogue {\n  opacity = 1\n  @initial { opacity = 0 }\n  @show { transition-duration = 280ms }\n}\n\nlayout main {",
      ),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    timed(h);
    h.game.context.system.now = () => timeline.currentTime;
    (h.game.context.system as any).composeBeats = true;
    await next(h);
    await at(100);
    h.ui.onPause();
    await at(900);
    h.ui.onUnpause();
    await at(950);
    const live = visible(h);
    expect(live).toBeGreaterThan(0);
    expect(live).toBeLessThan("slight problem".length);
    await toggle(h);
    atMostOneAhead(visible(h), live);
  });
  test("a reveal whose first letter waits, as a voiced line's does", async () => {
    const h = await opened();
    await pair(
      h,
      20,
      [...typed("slight problem")].map((e) => ({ ...e, after: (e.after ?? 0) + 0.2 })),
    );
    await pause(h, 100, 600);
    await at(800);
    const live = shownIn(h, "action");
    expect(live).toBeGreaterThan(0);
    expect(live).toBeLessThan("slight problem".length);
    await toggle(h);
    expect(same(h)).toBe(live);
  });

});