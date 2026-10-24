// The page applies a composed `ui/beat` (#1820) in one handler: its ops in
// the order the engine sent them, writes included, skipping a clear only
// when its next write is exactly what the target holds over its subtree as
// it is, then its sweep. A played beat commits at the instant its text starts
// revealing. The maintainer's rule: the old beat stays fully visible until
// that instant, and at that same instant the targets the new beat does not
// write are emptied and the written ones replaced.

import { DISCONNECTED } from "@impower/spark-engine/src/game/core/classes/Connection";
import { Coordinator } from "@impower/spark-engine/src/game/core/classes/Coordinator";
import { AnimateElementsMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/AnimateElementsMessage";
import { BatchElementsMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/BatchElementsMessage";
import { BeginReconcileMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/BeginReconcileMessage";
import { BeatMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/BeatMessage";
import { CreateElementMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/CreateElementMessage";
import { DestroyElementMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/DestroyElementMessage";
import { MoveElementMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/MoveElementMessage";
import { UpdateElementMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/UpdateElementMessage";
import { WriteImageMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { WriteTextMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
import { afterEach, describe, expect, test, vi } from "vitest";
import AssetManager from "../../app/managers/AssetManager";
import {
  createDOMHarness,
  createStubApp,
  flushMicrotasks,
  untilShown,
} from "./domTestHarness";

const SOURCE = `-> start

scene start
  HERO: Do you understand?
end
`;

const LINE = SOURCE.split("\n").findIndex((l) => l.includes("Do you understand?"));

/** A page showing the dialogue beat, as a composed preview leaves it. */
async function showing(src = SOURCE, line = LINE) {
  const h = createDOMHarness(src, line, { compose: true });
  await h.ready;
  await h.rerender(src, line);
  await flushMicrotasks(10);
  const dialogue = () =>
    h.overlay.querySelector(".dialogue > .text")?.textContent ?? "";
  return { h, dialogue };
}

/** A beat's ops that clear `target` and write it again, as the engine
 *  sends them. */
const write = (
  target: string,
  instructions: unknown[],
  opts: { instant?: boolean; time?: number } = {},
) => [
  WriteTextMessage.type.request({ target, instructions: [], instant: true }),
  WriteTextMessage.type.request({
    target,
    instructions: instructions as any,
    instant: opts.instant ?? true,
    ...(opts.time != null ? { time: opts.time } : {}),
  }),
];

/** A composed beat carrying `text` and `image` ops in that order. */
const beat = ({
  text = [],
  image = [],
  ...params
}: { text?: unknown[][]; image?: unknown[]; [key: string]: unknown }) =>
  BeatMessage.type.notification({
    messages: [...text.flat(), ...image],
    ...params,
  } as any);

/** Drive the page's timeline and timers by hand, and record the reveal
 *  animations the page starts. It sees when the DOM changes and when each
 *  reveal is set to begin, on the page's own clock; composited pixels are the
 *  live measurement's. */
function controlTime(h: { overlay: HTMLElement }) {
  const g = globalThis as any;
  const played: { startTime: number | null; effect: any }[] = [];
  const saved = { Animation: g.Animation, KeyframeEffect: g.KeyframeEffect };
  g.KeyframeEffect = class {
    constructor(
      public target: HTMLElement,
      public keyframes: unknown,
      public timing: { delay?: number } = {},
    ) {}
    getComputedTiming() {
      return { endTime: this.timing.delay ?? 0 };
    }
  };
  g.Animation = class {
    startTime: number | null = null;
    finished = Promise.resolve();
    constructor(public effect: any) {
      played.push(this);
    }
    play() {}
    cancel() {}
    finish() {}
  };
  const timeline = h.overlay.ownerDocument.timeline as unknown as {
    currentTime: number;
  };
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  timeline.currentTime = 1_000;
  const win = h.overlay.ownerDocument.defaultView as any;
  let changedAt: number | undefined;
  const observer = new win.MutationObserver(() => {
    changedAt ??= timeline.currentTime;
  });
  observer.observe(h.overlay, { subtree: true, childList: true, characterData: true });
  return {
    played,
    changedAt: () => changedAt,
    async at(time: number) {
      const step = time - timeline.currentTime;
      timeline.currentTime = time;
      vi.advanceTimersByTime(step);
      await flushMicrotasks(10);
    },
    /** The first instant a letter of the page's reveals is set to show. */
    firstReveal() {
      const letters = played.filter((a) =>
        a.effect?.target?.classList?.contains("text_letter"),
      );
      return Math.min(
        ...letters.map((a) => (a.startTime ?? NaN) + (a.effect.timing?.delay ?? 0)),
      );
    },
    restore() {
      observer.disconnect();
      g.Animation = saved.Animation;
      g.KeyframeEffect = saved.KeyframeEffect;
      timeline.currentTime = 0;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a composed beat on the page (#1820)", () => {
  test("a played beat commits at the instant its text starts revealing, the old beat whole until then", async () => {
    // Round 6, class 2.
    const { h, dialogue } = await showing();
    const time = controlTime(h);
    try {
      // Stamped to start at 1100; its first letter waits 100 ms.
      h.ui.onReceiveNotification(
        beat({
          text: [
            write(
              "dialogue",
              [
                { text: "D", after: 0.1 },
                { text: "o", after: 0.2 },
              ],
              { instant: false, time: 1_100 },
            ),
          ],
          time: 1_100,
        }),
      );
      await time.at(1_199);
      expect(dialogue()).toBe("Do you understand?");
      expect(time.changedAt()).toBeUndefined();

      await time.at(1_200);
      expect(dialogue()).toBe("Do");
      expect(time.firstReveal()).toBe(1_200);
      expect(time.changedAt()).toBe(1_200);
    } finally {
      time.restore();
    }
  });

  test("an unchanged name does not move the commit ahead of the new dialogue's first letter", async () => {
    // Round 7, class 3: the name the page already shows reveals nothing, so
    // only the dialogue's first letter counts.
    const { h, dialogue } = await showing();
    const name = h.overlay.querySelector(".character_name") as any;
    const shownName = JSON.parse(name.__sdTxt);
    const time = controlTime(h);
    try {
      h.ui.onReceiveNotification(
        beat({
          text: [
            write("character_name", shownName, { instant: false, time: 1_100 }),
            write("dialogue", [{ text: "S", after: 0.1 }], { instant: false, time: 1_100 }),
          ],
          time: 1_100,
        }),
      );
      await time.at(1_150);
      expect(dialogue()).toBe("Do you understand?");

      await time.at(1_200);
      expect(dialogue()).toBe("S");
    } finally {
      time.restore();
    }
  });

  test("a beat that arrives while one waits for its commit puts the waiting one up first, and later beats still go up", async () => {
    // Round 7, class 1: impossible by construction. One beat waits at a
    // time, and anything after it puts it up first; there is no held state a
    // stale timer could leave behind.
    const { h, dialogue } = await showing();
    const time = controlTime(h);
    try {
      h.ui.onReceiveNotification(
        beat({
          text: [write("dialogue", [{ text: "Waiting" }], { instant: false, time: 1_100 })],
          time: 1_100,
        }),
      );
      await time.at(1_010);
      expect(dialogue()).toBe("Do you understand?");

      h.ui.onReceiveNotification(beat({ text: [write("dialogue", [{ text: "Next" }])] }));
      expect(dialogue()).toBe("Next");
      // The waiting beat's timer finds nothing left to do.
      await time.at(1_300);
      h.ui.onReceiveNotification(beat({ text: [write("dialogue", [{ text: "Later" }])] }));
      expect(dialogue()).toBe("Later");
    } finally {
      time.restore();
    }
  });

  test("a beat's failure once applied is reported", async () => {
    // Round 6, class 5: impossible by construction that a failure hides
    // behind an early answer (the engine answers a composed op itself), and
    // a failure the page meets applying a beat is reported.
    const { h } = await showing();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const apply = h.ui.onReceiveRequest.bind(h.ui);
    (h.ui as any).onReceiveRequest = (msg: any) =>
      msg.method === "ui/write-text"
        ? Promise.reject(new Error("failed to apply"))
        : apply(msg);

    h.ui.onReceiveNotification(beat({ text: [write("dialogue", [{ text: "X" }])] }));
    await flushMicrotasks(10);

    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining("ui/write-text failed in a beat"),
      expect.objectContaining({ message: "failed to apply" }),
    );
  });

  test("the pictures a beat waiting for its commit will paint stay resident", async () => {
    // Round 6, class 6.
    const { h } = await showing();
    const assets = new AssetManager(createStubApp(h.overlay, () => {}));
    const src = "https://example.com/waiting.png";
    const time = controlTime(h);
    try {
      expect(assets.derivedPins().has(src)).toBe(false);
      h.ui.onReceiveNotification(
        beat({
          image: [
            WriteImageMessage.type.request({
              target: "portrait",
              instructions: [{ control: "show", content: { srcs: [src] } } as any],
              instant: false,
              time: 1_100,
            }),
          ],
          time: 1_100,
        }),
      );
      expect(assets.derivedPins().has(src)).toBe(true);
    } finally {
      time.restore();
    }
  });

  test("a display still waiting has no time limit: the page shows the old screen whole", async () => {
    // Round 6, class 4: impossible by construction. Nothing of a display
    // reaches the page before its beat, and the page keeps no timer for it.
    const { h, dialogue } = await showing();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    await h.rerender(SOURCE, LINE, { connectOnly: true });
    vi.advanceTimersByTime(60_000);
    await flushMicrotasks(10);

    expect(dialogue()).toBe("Do you understand?");
  });
});

const LAYOUT = (dialogue: string, leaf: string) => `layout main with
  textbox {
    ${dialogue} {
      ${leaf}
      stroke
    }
  }
end

${SOURCE}`;

const LAYOUT_LINE = LINE + 9;

describe("a composed beat's dedupe against the live DOM (#1820)", () => {
  test("a target whose leaf the display changes is rewritten, not left as it was", async () => {
    // Round 6, class 1: the layout's text leaf gains content while the same
    // line is previewed. The beat's create puts it in the reused leaf; the
    // dialogue then holds only its line.
    const { h } = await showing(LAYOUT("dialogue", "text"), LAYOUT_LINE);
    const text = () => h.overlay.querySelector(".dialogue > .text")?.textContent;
    expect(text()).toBe("Do you understand?");

    await h.rerender(LAYOUT("dialogue", 'text "placeholder"'), LAYOUT_LINE);

    expect(text()).toBe("Do you understand?");
  });

  test("a style-only change of a reused target leaves its identical text as it is", async () => {
    // Round 7, class 6: a create that restyles the target changes nothing it
    // holds, so its identical text is not rebuilt.
    const { h } = await showing(LAYOUT("dialogue", "text"), LAYOUT_LINE);
    const leaf = h.overlay.querySelector(".dialogue > .text")!;
    expect(leaf.textContent).toBe("Do you understand?");
    const win = h.overlay.ownerDocument.defaultView as any;
    const rebuilt: MutationRecord[] = [];
    const observer = new win.MutationObserver((records: MutationRecord[]) =>
      rebuilt.push(...records),
    );
    observer.observe(leaf, { childList: true, subtree: true, characterData: true });

    await h.rerender(LAYOUT("dialogue #background-color=red", "text"), LAYOUT_LINE);
    rebuilt.push(...observer.takeRecords());
    observer.disconnect();

    expect(h.overlay.querySelector(".dialogue > .text")).toBe(leaf);
    expect(leaf.textContent).toBe("Do you understand?");
    expect(rebuilt).toEqual([]);
  });
});

describe("a composed beat on the page, round 1 of PR #1865", () => {
  test("a message for another of the page's managers leaves a waiting beat waiting", async () => {
    const { h, dialogue } = await showing();
    const time = controlTime(h);
    try {
      h.ui.onReceiveNotification(
        beat({
          text: [write("dialogue", [{ text: "N", after: 0.1 }], { instant: false, time: 1_100 })],
          time: 1_100,
        }),
      );
      await time.at(1_010);
      h.ui.onReceiveNotification({ jsonrpc: "2.0", method: "assets/prefetch", params: {} } as any);
      void h.ui.onReceiveRequest({ jsonrpc: "2.0", id: "1", method: "audio/update", params: {} } as any);
      await flushMicrotasks(10);
      expect(dialogue()).toBe("Do you understand?");

      await time.at(1_200);
      expect(dialogue()).toBe("N");
    } finally {
      time.restore();
    }
  });

  test("a leading space does not commit the beat before its first visible letter", async () => {
    const { h, dialogue } = await showing();
    const time = controlTime(h);
    try {
      h.ui.onReceiveNotification(
        beat({
          text: [
            write(
              "dialogue",
              [
                { text: " ", after: 0 },
                { text: "H", after: 0.025 },
              ],
              { instant: false, time: 1_100 },
            ),
          ],
          time: 1_100,
        }),
      );
      await time.at(1_110);
      expect(dialogue()).toBe("Do you understand?");

      await time.at(1_125);
      expect(dialogue()).toBe(" H");
    } finally {
      time.restore();
    }
  });
});

const HUD = `layout main with
  textbox {
    character_info {
      character_name {
        text
      }
    }
    dialogue {
      text
    }
  }
end

layout hud with
  panel {
    dialogue {
      text "HUD label"
    }
  }
end

-> start

scene start
  HERO:
    [[open hud]]
    Hello.
end
`;

describe("a composed beat's writes keep their place in its structure (#1820)", () => {
  test("a layout the beat opens after its write keeps its own content", async () => {
    // The beat writes the dialogue, then opens a layout with a dialogue of
    // its own: the write went to the dialogue there was, as on the base.
    const h = createDOMHarness(HUD, 0, { compose: true, autoOpenAll: false });
    await h.ready;
    h.game.module.ui.sweepReconcile();
    await flushMicrotasks(10);
    h.game.context.system.previewing = undefined;
    h.jumpTo("start");
    const next = h.nextBeat();
    expect(next).toBeTruthy();
    const coordinator = new Coordinator(h.game, next!);
    for (let i = 0; i < 10; i += 1) {
      await flushMicrotasks();
      coordinator.onUpdate({ deltaMS: 0 } as any);
    }
    await flushMicrotasks(10);
    await untilShown(h.overlay);

    expect(h.overlay.querySelector(".panel .dialogue > .text")?.textContent).toBe("HUD label");
    expect(h.overlay.querySelector(".textbox .dialogue > .text")?.textContent).toBe("Hello.");
  });
});

/** A composed page whose game plays on: its connect's display is up, and
 *  beats are composed as PLAY composes them. */
async function playing(src: string, opts: { autoOpenAll?: boolean } = {}) {
  const h = createDOMHarness(src, 0, { compose: true, autoOpenAll: opts.autoOpenAll });
  await h.ready;
  h.game.module.ui.sweepReconcile();
  await flushMicrotasks(10);
  h.game.context.system.previewing = undefined;
  h.jumpTo("start");
  return h;
}

/** Play the next beat through the Coordinator, as PLAY does, and wait for
 *  the page to commit it. */
async function playNext(h: Awaited<ReturnType<typeof playing>>) {
  const next = h.nextBeat();
  expect(next).toBeTruthy();
  const coordinator = new Coordinator(h.game, next!);
  for (let i = 0; i < 10; i += 1) {
    await flushMicrotasks();
    coordinator.onUpdate({ deltaMS: 0 } as any);
  }
  await flushMicrotasks(10);
  await untilShown(h.overlay);
}

/** Compose one beat by hand, as a played beat does. */
async function composeBeat(h: { game: any; overlay: HTMLElement }, ops: (ui: any) => void) {
  const ui: any = h.game.module.ui;
  expect(ui.beginCompose()).toBe(true);
  ops(ui);
  void ui.endCompose({});
  await flushMicrotasks(20);
}

const texts = (h: { overlay: HTMLElement }, selector: string) =>
  Array.from(h.overlay.querySelectorAll(selector)).map((el) => el.textContent);

describe("a composed beat applies its ops in order, round 2 of PR #1865", () => {
  test("a write keeps its place before the structure that follows it", async () => {
    // D2: the beat writes the dialogue, then its layout refresh adds a leaf
    // with content of its own inside the dialogue. In order, the write went
    // to the leaf there was, as on the base.
    const h = await playing(`store alternate = false

layout main with
  textbox {
    character_info {
      character_name {
        text
      }
    }
    dialogue {
      text
      if alternate then
        text "NEW"
      end
    }
  }
end

-> start

scene start
  HERO: Second.
end
`);
    h.game.story.variablesState.$("alternate", true);
    await playNext(h);

    expect(texts(h, ".dialogue > .text")).toEqual(["Second.", "NEW"]);
  });

  test("a clear under one selector removes a write under another that reached the same element", async () => {
    // D3: clear, write A to dialogue#0, clear, write B to dialogue. Applied
    // one at a time that ends on B alone.
    const h = await playing(SOURCE);
    await composeBeat(h, (ui) => {
      void ui.text.clear("dialogue");
      void ui.text.write("dialogue#0", [{ text: "A" }], true);
      void ui.text.clear("dialogue");
      void ui.text.write("dialogue", [{ text: "B" }], true);
    });

    expect(texts(h, ".dialogue > .text")).toEqual(["B"]);
  });

  test("a write to an indexed target reaches the element it named, though the beat moves it after", async () => {
    // D4: dialogue#0 is written, then moved behind its sibling in the same
    // beat. The write stays with the element it went to.
    const h = await playing(`layout main with
  textbox {
    dialogue {
      text
    }
    dialogue {
      text
    }
  }
end

-> start

scene start
  Nothing to say.
end
`);
    await composeBeat(h, (ui) => {
      const [first] = ui.findElements("dialogue");
      void ui.text.write("dialogue#0", [{ text: "A" }], true);
      ui.moveElement(first, null);
    });

    expect(texts(h, ".dialogue > .text")).toEqual(["", "A"]);
  });

  test("a clear is kept when the target holds more than the write that follows it", async () => {
    // D5: the dialogue holds its line and B, written after it without a
    // clear. A beat that clears it and writes B ends on B alone.
    const h = await playing(SOURCE);
    await playNext(h);
    await composeBeat(h, (ui) => {
      void ui.text.write("dialogue", [{ text: "B" }], true);
    });
    const before = texts(h, ".dialogue > .text")[0];
    expect(before?.endsWith("B")).toBe(true);
    expect(before).not.toBe("B");

    await composeBeat(h, (ui) => {
      void ui.text.clear("dialogue");
      void ui.text.write("dialogue", [{ text: "B" }], true);
    });

    expect(texts(h, ".dialogue > .text")).toEqual(["B"]);
  });
});

const TRANSITIONS = `layout main with
  textbox {
    character_info {
      character_name {
        text
      }
    }
    dialogue {
      text
    }
  }
end

layout hud with
  panel {
    stats {
      text "HUD"
    }
  }
end

-> start

scene start
  HERO:
    [[open hud]]
    First.

  HERO:
    [[close hud with fade over 0.5s]] [[open hud]]
    Second.

  HERO: Third.
end
`;

/** Animations whose end the test decides: \`finished\` settles on \`end()\`. */
function holdAnimations() {
  const g = globalThis as any;
  const saved = g.Animation;
  const waiting: (() => void)[] = [];
  g.Animation = class {
    startTime: number | null = null;
    finished: Promise<void>;
    constructor(public effect?: unknown) {
      this.finished = new Promise((resolve) => waiting.push(resolve));
    }
    play() {}
    cancel() {}
    finish() {}
  };
  return {
    end() {
      for (const resolve of waiting.splice(0)) {
        resolve();
      }
    },
    restore() {
      this.end();
      g.Animation = saved;
    },
  };
}

describe("layout transitions in a composed beat: the maintainer's decision (#1820)", () => {
  test("a layout closed and reopened in one beat mounts a fresh element while the old one animates out", async () => {
    const h = await playing(TRANSITIONS, { autoOpenAll: false });
    await playNext(h);
    const panels = () => Array.from(h.overlay.querySelectorAll(".panel"));
    expect(panels()).toHaveLength(1);
    const [old] = panels();
    const animations = holdAnimations();
    try {
      await playNext(h);

      // The new beat is up, with a fresh panel beside the one retiring.
      expect(texts(h, ".dialogue > .text")).toEqual(["Second."]);
      expect(panels()).toHaveLength(2);
      expect(panels()).toContain(old);
      const fresh = panels().find((el) => el !== old) as any;
      expect(fresh.__sdId).not.toBe((old as any).__sdId);

      // Once its exit has played, the old one goes.
      animations.end();
      await flushMicrotasks(30);
      expect(panels()).toEqual([fresh]);
    } finally {
      animations.restore();
    }
  });

  test("an exit still playing does not hold the next beat back", async () => {
    const h = await playing(TRANSITIONS, { autoOpenAll: false });
    await playNext(h);
    const animations = holdAnimations();
    try {
      await playNext(h);
      const panels = () => Array.from(h.overlay.querySelectorAll(".panel"));
      expect(panels()).toHaveLength(2);

      await playNext(h);

      // The third beat commits while the old panel is still playing out.
      expect(texts(h, ".dialogue > .text")).toEqual(["Third."]);
      expect(panels()).toHaveLength(2);
      animations.end();
      await flushMicrotasks(30);
      expect(panels()).toHaveLength(1);
    } finally {
      animations.restore();
    }
  });
});

/** Apply `ops` on the page one at a time, as it receives them. */
const apply = (h: { ui: any }, ...ops: any[]) => {
  for (const op of ops) {
    void h.ui.onReceiveRequest(op);
  }
};

/** A beat that clears the dialogue and writes back exactly what it shows. */
const rewrite = (h: { overlay: HTMLElement }) => {
  const target = h.overlay.querySelector(".dialogue") as any;
  return beat({ text: [write("dialogue", JSON.parse(target.__sdTxt))] });
};

const letters = (h: { overlay: HTMLElement }) =>
  Array.from(h.overlay.querySelectorAll(".dialogue > .text .text_letter"));

type Ids = { dialogue: string; leaf: string; tag: string };

/** Every structural way an op can change the dialogue's subtree: what it
 *  needs there first, and the op. */
const MUTATIONS: [string, { setup?: (ids: Ids) => any[]; mutate: (ids: Ids) => any[] }][] = [
  [
    "a node created in it",
    { mutate: ({ dialogue }) => [CreateElementMessage.type.request({ parent: dialogue, element: `${dialogue}-extra`, type: "span", name: "extra" })] },
  ],
  [
    "a node destroyed in it",
    {
      setup: ({ dialogue }) => [CreateElementMessage.type.request({ parent: dialogue, element: `${dialogue}-extra`, type: "span", name: "extra" })],
      mutate: ({ dialogue }) => [DestroyElementMessage.type.request({ element: `${dialogue}-extra` })],
    },
  ],
  [
    "a node moved in it",
    {
      setup: ({ dialogue }) => [CreateElementMessage.type.request({ parent: dialogue, element: `${dialogue}-extra`, type: "span", name: "extra" })],
      mutate: ({ leaf }) => [MoveElementMessage.type.request({ element: leaf, before: null } as any)],
    },
  ],
  [
    "a node's style changed in it",
    { mutate: ({ leaf }) => [UpdateElementMessage.type.request({ element: leaf, style: { color: "red" } } as any)] },
  ],
  [
    "a node's attributes changed in it",
    { mutate: ({ leaf }) => [UpdateElementMessage.type.request({ element: leaf, attributes: { title: "changed" } } as any)] },
  ],
  [
    "a node's content replaced in it",
    { mutate: ({ leaf }) => [UpdateElementMessage.type.request({ element: leaf, content: { text: "" } } as any)] },
  ],
  [
    "a leaf replaced in it",
    {
      mutate: ({ dialogue, leaf, tag }) => [
        CreateElementMessage.type.request({ parent: dialogue, element: leaf, type: tag === "div" ? "span" : "div", name: "text" }),
      ],
    },
  ],
];

describe("a composed beat's dedupe after a structural change, round 3 of PR #1865", () => {
  test.each(MUTATIONS)(
    "%s: the next clear is kept, and the no-op holds again once the target is rewritten",
    async (_, { setup, mutate }) => {
      // Class 1: every op the manager applies to a target's subtree leaves
      // the target's signatures older than the subtree, in one place.
      const { h, dialogue } = await showing();
      const line = dialogue();
      const leafEl = h.overlay.querySelector(".dialogue > .text") as any;
      const ids: Ids = {
        dialogue: (h.overlay.querySelector(".dialogue") as any).__sdId,
        leaf: leafEl.__sdId,
        tag: leafEl.tagName.toLowerCase(),
      };
      if (setup) {
        apply(h, ...setup(ids));
        h.ui.onReceiveNotification(rewrite(h));
        await flushMicrotasks(10);
      }
      const before = letters(h);
      expect(before.length).toBeGreaterThan(0);

      apply(h, ...mutate(ids));
      h.ui.onReceiveNotification(rewrite(h));
      await flushMicrotasks(10);

      // The clear went: the dialogue was rebuilt, and holds its line once.
      expect(texts(h, ".dialogue > .text")).toEqual([line]);
      expect(letters(h).some((l) => before.includes(l))).toBe(false);

      // Rewritten over its subtree as it is, the same beat is a no-op again.
      const rebuilt = letters(h);
      h.ui.onReceiveNotification(rewrite(h));
      await flushMicrotasks(10);
      expect(letters(h)).toEqual(rebuilt);
      expect(letters(h).every((l, i) => l === rebuilt[i])).toBe(true);
    },
  );

  test("a picture whose target gains a mask is painted in it", async () => {
    // Class 1, as round 3 found it: a mask added to a portrait showing A,
    // then A again.
    const { h } = await showing();
    apply(
      h,
      CreateElementMessage.type.request({ parent: null, element: "probe-portrait", type: "div", name: "probe_portrait" }),
      CreateElementMessage.type.request({ parent: "probe-portrait", element: "probe-portrait-image", type: "span", name: "image" }),
    );
    const show = () =>
      beat({
        image: [
          WriteImageMessage.type.request({ target: "probe_portrait", instructions: [], instant: true } as any),
          WriteImageMessage.type.request({
            target: "probe_portrait",
            instructions: [
              {
                control: "show",
                content: { background: 'url("a.png")', imageNames: "a", src: "a.png", srcs: ["a.png"] },
              },
            ],
            instant: true,
          } as any),
        ],
      });
    h.ui.onReceiveNotification(show());
    await flushMicrotasks(10);
    expect(h.overlay.querySelector(".probe_portrait > .image")?.children.length).toBe(1);

    apply(h, CreateElementMessage.type.request({ parent: "probe-portrait", element: "probe-portrait-mask", type: "span", name: "mask" }));
    h.ui.onReceiveNotification(show());
    await flushMicrotasks(10);

    expect(h.overlay.querySelector(".probe_portrait > .mask")?.children.length).toBe(1);
  });
});

/** How the page answered a request: its result, its error, or still pending. */
const outcome = (answered: Promise<unknown>) =>
  Promise.race([
    answered.then(
      (result) => ({ result }),
      (error) => ({ error }),
    ),
    flushMicrotasks(20).then(() => "pending" as const),
  ]);

describe("the retirement path on the page, round 3 of PR #1865", () => {
  test("a layout going once it has retired leaves a beat waiting for its commit waiting", async () => {
    // Class 2: the engine lets a retired layout go in a batch of its own.
    const { h, dialogue } = await showing();
    apply(h, CreateElementMessage.type.request({ parent: null, element: "probe-retiring", type: "div", name: "probe_retiring" }));
    const time = controlTime(h);
    try {
      h.ui.onReceiveNotification(
        beat({
          text: [write("dialogue", [{ text: "N", after: 0.1 }], { instant: false, time: 1_100 })],
          time: 1_100,
        }),
      );
      await time.at(1_010);
      h.ui.onReceiveNotification(
        BatchElementsMessage.type.notification({
          messages: [DestroyElementMessage.type.request({ element: "probe-retiring", retired: true } as any)],
        }),
      );
      await flushMicrotasks(10);
      expect(h.overlay.querySelector(".probe_retiring")).toBeNull();
      expect(dialogue()).toBe("Do you understand?");

      await time.at(1_200);
      expect(dialogue()).toBe("N");
    } finally {
      time.restore();
    }
  });

  /** How the engine's wait for `answered` has ended so far. */
  const animation = (h: { overlay: HTMLElement }) =>
    AnimateElementsMessage.type.request({
      effects: [{ element: (h.overlay.querySelector(".dialogue") as any).__sdId, animations: [] }],
    });

  test("an animation a beat carries is answered with the effects it played", async () => {
    // U3: the page's answer is the animation's own result.
    const { h } = await showing();
    const animate = animation(h);
    const answered = h.game.connection.expect(animate);
    h.ui.onReceiveNotification(beat({ image: [animate] }));

    expect(await outcome(answered)).toEqual({ result: [0] });
  });

  test("an animation a beat carries is answered with an error when it fails, or when the page goes first", async () => {
    // U2: the page answers it as it answers every request it receives.
    const { h } = await showing();
    const handle = h.ui.onReceiveRequest.bind(h.ui);
    let fail = true;
    (h.ui as any).onReceiveRequest = (msg: any) =>
      msg.method === "ui/animate"
        ? fail
          ? Promise.reject(new Error("failed to animate"))
          : new Promise(() => {})
        : handle(msg);

    const failing = animation(h);
    const failed = h.game.connection.expect(failing);
    h.ui.onReceiveNotification(beat({ image: [failing] }));
    expect(await outcome(failed)).toMatchObject({ error: { message: "failed to animate" } });

    fail = false;
    const playing = animation(h);
    const unfinished = h.game.connection.expect(playing);
    h.ui.onReceiveNotification(beat({ image: [playing] }));
    expect(await outcome(unfinished)).toBe("pending");
    h.router.disconnect();
    expect(await outcome(unfinished)).toMatchObject({ error: { code: DISCONNECTED } });
  });
});

describe("one decision per beat, round 4 of PR #1865", () => {
  const ids = (h: { overlay: HTMLElement }) => ({
    leaf: (h.overlay.querySelector(".dialogue > .text") as any).__sdId as string,
    shown: JSON.parse((h.overlay.querySelector(".dialogue") as any).__sdTxt),
    name: JSON.parse((h.overlay.querySelector(".character_name") as any).__sdTxt),
  });

  /** The dialogue's write, played: its first letter 100 ms into the beat. */
  const played = (instructions: { text?: string }[]) =>
    instructions.map((e, i) => ({ ...e, after: 0.1 + i * 0.01 }));

  test("the commit instant and the apply take the same decision for every write", async () => {
    // R4-1: a structural change in the dialogue before its clear keeps the
    // clear, so its identical write reveals again and the beat commits at
    // that write's first letter. The unchanged name reveals nothing and is
    // left as it is.
    const { h, dialogue } = await showing();
    const { leaf, shown, name } = ids(h);
    const nameLeaf = h.overlay.querySelector(".character_name > .text")!;
    const nameLetters = Array.from(nameLeaf.childNodes);
    const line = dialogue();
    // The dialogue's line as a played write, held once on the page.
    h.ui.onReceiveNotification(beat({ text: [write("dialogue", played(shown))] }));
    await flushMicrotasks(10);
    const time = controlTime(h);
    try {
      h.ui.onReceiveNotification(
        beat({
          text: [
            write("character_name", name, { instant: false, time: 1_100 }),
            [UpdateElementMessage.type.request({ element: leaf, style: { color: "red" } } as any)],
            write("dialogue", played(shown), { instant: false, time: 1_100 }),
          ],
          time: 1_100,
        }),
      );
      await time.at(1_199);
      expect(time.changedAt()).toBeUndefined();
      expect(dialogue()).toBe(line);

      await time.at(1_200);
      expect(time.changedAt()).toBe(1_200);
      expect(time.firstReveal()).toBe(1_200);
      expect(dialogue()).toBe(line);
      expect(Array.from(nameLeaf.childNodes)).toEqual(nameLetters);
    } finally {
      time.restore();
    }
  });

  test("an identical text write with no clear, after a structural change in its target, is written again and commits at its first letter", async () => {
    // The leaf's content is replaced before the write: left as it was, the
    // dialogue would stay empty.
    const { h, dialogue } = await showing();
    const { leaf, shown } = ids(h);
    const line = dialogue();
    h.ui.onReceiveNotification(beat({ text: [write("dialogue", played(shown))] }));
    await flushMicrotasks(10);
    const time = controlTime(h);
    try {
      h.ui.onReceiveNotification(
        beat({
          text: [
            [UpdateElementMessage.type.request({ element: leaf, content: { text: "" } } as any)],
            [
              WriteTextMessage.type.request({
                target: "dialogue",
                instructions: played(shown) as any,
                instant: false,
                time: 1_100,
              }),
            ],
          ],
          time: 1_100,
        }),
      );
      await time.at(1_199);
      expect(time.changedAt()).toBeUndefined();

      await time.at(1_200);
      expect(time.changedAt()).toBe(1_200);
      expect(time.firstReveal()).toBe(1_200);
      expect(dialogue()).toBe(line);
    } finally {
      time.restore();
    }
  });

  test("an identical picture with no clear, after its target gains a mask, is painted in it", async () => {
    // R4-2: a played beat writes the picture its target shows without
    // clearing it first, as the Coordinator does for a picture the beat
    // writes.
    const { h } = await showing();
    apply(
      h,
      CreateElementMessage.type.request({ parent: null, element: "probe-portrait", type: "div", name: "probe_portrait" }),
      CreateElementMessage.type.request({ parent: "probe-portrait", element: "probe-portrait-image", type: "span", name: "image" }),
    );
    const picture = () =>
      WriteImageMessage.type.request({
        target: "probe_portrait",
        instructions: [
          {
            control: "show",
            content: { background: 'url("a.png")', imageNames: "a", src: "a.png", srcs: ["a.png"] },
          },
        ],
        instant: true,
      } as any);
    h.ui.onReceiveNotification(beat({ image: [picture()] }));
    await flushMicrotasks(10);
    expect(h.overlay.querySelector(".probe_portrait > .image")?.children.length).toBe(1);

    apply(h, CreateElementMessage.type.request({ parent: "probe-portrait", element: "probe-portrait-mask", type: "span", name: "mask" }));
    h.ui.onReceiveNotification(beat({ image: [picture()] }));
    await flushMicrotasks(10);

    expect(h.overlay.querySelector(".probe_portrait > .mask")?.children.length).toBeGreaterThan(0);
  });
});

describe("round 5 of PR #1865", () => {
  test("a target the beat makes is followed through its writes: an identical write is a no-op there too", async () => {
    // R5-1: applied one at a time, the second write finds the first's
    // signature and leaves the text as it is.
    const { h } = await showing();
    const text = (instructions: { text: string }[]) =>
      WriteTextMessage.type.request({
        target: "probe_made",
        instructions: instructions as any,
        instant: true,
        elements: ["probe-made"],
      } as any);
    h.ui.onReceiveNotification(
      beat({
        text: [
          [
            CreateElementMessage.type.request({ parent: null, element: "probe-made", type: "div", name: "probe_made" }),
            CreateElementMessage.type.request({ parent: "probe-made", element: "probe-made-text", type: "span", name: "text" }),
          ],
          [text([{ text: "A" }]), text([{ text: "A" }])],
        ],
      }),
    );
    await flushMicrotasks(10);

    expect(texts(h, ".probe_made > .text")).toEqual(["A"]);
  });

  test("a played beat waiting for its commit never goes up once its application is torn down", async () => {
    // R5-3: STOP before the beat's first letter. The screen stays as it is
    // until the next display.
    const { h, dialogue } = await showing();
    const time = controlTime(h);
    try {
      h.ui.onReceiveNotification(
        beat({
          text: [write("dialogue", [{ text: "N", after: 0.1 }], { instant: false, time: 1_100 })],
          time: 1_100,
        }),
      );
      await time.at(1_010);
      h.ui.onDispose();

      await time.at(1_300);
      expect(dialogue()).toBe("Do you understand?");
      expect(time.changedAt()).toBeUndefined();
      expect((h.overlay as any).__sdBeat).toBeUndefined();
    } finally {
      time.restore();
    }
  });

  test("an animation a beat waiting for its commit carries is answered with the disconnect error when STOP calls the beat off (#1219)", async () => {
    // STOP tears the page down as Application.tearDown does: the router
    // disconnects, then the manager is disposed.
    const { h } = await showing();
    const exit = AnimateElementsMessage.type.request({
      effects: [{ element: (h.overlay.querySelector(".dialogue") as any).__sdId, animations: [] }],
    });
    const answered = h.game.connection.expect(exit);
    const time = controlTime(h);
    try {
      h.ui.onReceiveNotification(
        beat({
          text: [write("dialogue", [{ text: "N", after: 0.1 }], { instant: false, time: 1_100 })],
          image: [exit],
          time: 1_100,
        }),
      );
      await time.at(1_010);
      expect((h.overlay as any).__sdBeat).toBeDefined();
      h.router.disconnect();
      h.ui.onDispose();

      await time.at(1_300);
      expect(await outcome(answered)).toMatchObject({ error: { code: DISCONNECTED } });
    } finally {
      time.restore();
    }
  });
});

const NAMED = `layout main with
  textbox {
    character_name {
      text "Name:"
    }
    dialogue {
      text
    }
  }
end

${SOURCE}`;

const NAMED_LINE = NAMED.split("\n").findIndex((l) => l.includes("Do you understand?"));

describe("a layout's own text in a written target is a placeholder a write replaces (#1813)", () => {
  const nameText = (h: { overlay: HTMLElement }) =>
    h.overlay.querySelector(".character_name > .text")?.textContent;

  for (const connect of [false, true]) {
    test(`a standing name the first write replaced is the same on the next played beat, which commits at its dialogue's first letter${connect ? ", after PLAY's connect" : ""}`, async () => {
      // Round 1 of PR #1873, R1: a write over the layout's text recorded no
      // history, so the identical name was written again and the beat
      // committed at its first letter, blanking the old dialogue early.
      const { h, dialogue } = await showing(NAMED, NAMED_LINE);
      const name = h.overlay.querySelector(".character_name") as any;
      const shownName = JSON.parse(name.__sdTxt);
      if (connect) {
        // PLAY's connect is not composed: it opens a pass of its own.
        h.ui.onReceiveNotification(BeginReconcileMessage.type.notification({}) as any);
      }
      const time = controlTime(h);
      try {
        h.ui.onReceiveNotification(
          beat({
            text: [
              [
                WriteTextMessage.type.request({
                  target: "character_name",
                  instructions: shownName,
                  instant: false,
                  time: 1_100,
                }),
              ],
              write("dialogue", [{ text: "S", after: 0.1 }], { instant: false, time: 1_100 }),
            ],
            time: 1_100,
          }),
        );
        await time.at(1_150);
        expect(dialogue()).toBe("Do you understand?");
        expect(time.changedAt()).toBeUndefined();

        await time.at(1_200);
        expect(dialogue()).toBe("S");
        expect(nameText(h)).toBe("HERO");
      } finally {
        time.restore();
      }
    });
  }

  test("a clear after the first write leaves the target empty, not the placeholder back", async () => {
    // Only a connect, whose layout creates put the placeholder back, shows
    // it again.
    const { h } = await showing(NAMED, NAMED_LINE);
    expect(nameText(h)).toBe("HERO");
    h.ui.onReceiveNotification(
      beat({
        text: [
          [WriteTextMessage.type.request({ target: "character_name", instructions: [], instant: true })],
        ],
      }),
    );
    await flushMicrotasks(10);
    expect(nameText(h)).toBe("");
  });
});
