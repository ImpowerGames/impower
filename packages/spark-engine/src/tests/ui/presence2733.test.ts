import { describe, expect, test } from "vitest";
import type { Clock } from "../../game/core/classes/Clock";
import { Coordinator } from "../../game/core/classes/Coordinator";
import type { Game } from "../../game/core/classes/Game";
import {
  createHarness,
  flushMicrotasks,
  type UIHarness,
} from "./harness/uiTestHarness";

const PRESENCE = "data-presence";

const NO_BOX = `define ui as config with
  layouts_initial = { }
end
`;

const lines = (style: string) => `${NO_BOX}
${style}

layout main {
  dialogue {
    text
  }
  action {
    text
  }
}
`;

const FADING = `style dialogue {
  opacity = 1
  @initial { opacity = 0 }
  @show { transition-duration = 280ms }
  @hide { opacity = 0 }
}`;

const playing = (game: Game) => {
  game.context.system.previewing = undefined;
  game.context.system.composeBeats = true;
};

const wire = (messages: any[]): any[] =>
  messages.flatMap((m: any) =>
    (m?.method === "ui/batch" || m?.method === "ui/beat") &&
    Array.isArray(m.params?.messages)
      ? wire(m.params.messages)
      : [m],
  );

const touching = (h: UIHarness, id: string) =>
  wire(h.messages).filter(
    (m: any) =>
      (m?.method === "ui/create" || m?.method === "ui/update") &&
      m.params?.element === id,
  );

const displayOf = (h: UIHarness, id: string) => {
  let display: string | null | undefined;
  for (const m of touching(h, id)) {
    if (m.params.style && "display" in m.params.style) {
      display = m.params.style.display;
    }
  }
  return display;
};

const presenceOf = (h: UIHarness, id: string) => {
  let presence: string | null | undefined;
  for (const m of touching(h, id)) {
    if (m.params.attributes && PRESENCE in m.params.attributes) {
      presence = m.params.attributes[PRESENCE];
    }
  }
  return presence;
};

const motions = (h: UIHarness) =>
  wire(h.messages)
    .filter((m: any) => m?.method === "ui/presence")
    .flatMap((m: any) => m.params.effects);

const destroyed = (h: UIHarness, id: string) =>
  wire(h.messages).filter(
    (m: any) => m?.method === "ui/destroy" && m.params?.element === id,
  );

const textWrites = (h: UIHarness, target: string) =>
  wire(h.messages).filter(
    (m: any) => m?.method === "ui/write-text" && m.params?.target === target,
  );

async function play(h: UIHarness, beat: Record<string, unknown>) {
  const coordinator = new Coordinator(h.game, { end: 0, ...beat } as any);
  for (let i = 0; i < 10; i += 1) {
    await flushMicrotasks(10);
    (coordinator as any)._onTick?.(100);
  }
  await flushMicrotasks(20);
  return coordinator;
}

async function settle(h: UIHarness) {
  h.releasePresence();
  await flushMicrotasks(30);
}

const harness = (source: string, opts: { live?: boolean } = {}) =>
  createHarness(source, 0, {
    reactive: true,
    autoOpenAll: false,
    holdPresence: true,
    beforeConnect: opts.live === false ? undefined : playing,
  });

const dialogueLine = { text: { dialogue: [{ text: "Hi." }] } };
const actionLine = { text: { action: [{ text: "Then." }] } };

describe("an element that gains its content (#2733)", () => {
  test("appears with its @initial look and is asked to play its arrival", async () => {
    const h = harness(lines(FADING));
    await h.ready;
    const [dialogue] = h.game.module.ui.findIds("dialogue");
    h.reset();
    await play(h, dialogueLine);
    const shown = touching(h, dialogue!).find(
      (m: any) => m.params.style && "display" in m.params.style && m.params.style.display === null,
    );
    expect(shown?.params.attributes?.[PRESENCE]).toBe("initial");
    expect(motions(h)).toEqual([{ element: dialogue, presence: "show" }]);
  });

  test("plays no arrival when its style has no @initial or @show", async () => {
    const h = harness(lines(`style dialogue {
  @hide { opacity = 0 }
}`));
    await h.ready;
    const [dialogue] = h.game.module.ui.findIds("dialogue");
    h.reset();
    await play(h, dialogueLine);
    expect(displayOf(h, dialogue!)).toBeNull();
    expect(presenceOf(h, dialogue!)).toBeUndefined();
    expect(motions(h)).toEqual([]);
  });
});

describe("an element that loses its content (#2733)", () => {
  test("stays on screen until the renderer reports its motion ended", async () => {
    const h = harness(lines(FADING));
    await h.ready;
    const [dialogue] = h.game.module.ui.findIds("dialogue");
    await play(h, dialogueLine);
    await settle(h);
    h.reset();
    await play(h, actionLine);
    expect(motions(h)).toContainEqual({ element: dialogue, presence: "hide" });
    expect(displayOf(h, dialogue!)).toBeUndefined();
    expect(textWrites(h, "dialogue")).toEqual([]);
    await settle(h);
    expect(displayOf(h, dialogue!)).toBe("none");
    expect(presenceOf(h, dialogue!)).toBeNull();
    expect(textWrites(h, "dialogue").at(-1)?.params).toMatchObject({
      instructions: [],
      elements: [dialogue],
    });
  });

  test("is removed at once when its style has no @hide", async () => {
    const h = harness(lines(`style dialogue {
  @initial { opacity = 0 }
}`));
    await h.ready;
    const [dialogue] = h.game.module.ui.findIds("dialogue");
    await play(h, dialogueLine);
    await settle(h);
    h.reset();
    await play(h, actionLine);
    expect(displayOf(h, dialogue!)).toBe("none");
    expect(motions(h)).toEqual([]);
  });

  test("keeps its place when the next line writes to it, with its content replaced", async () => {
    const h = harness(lines(FADING));
    await h.ready;
    const [dialogue] = h.game.module.ui.findIds("dialogue");
    await play(h, dialogueLine);
    await settle(h);
    h.reset();
    await play(h, { text: { dialogue: [{ text: "Again." }] } });
    expect(motions(h)).toEqual([]);
    expect(displayOf(h, dialogue!)).toBeNull();
    expect(presenceOf(h, dialogue!)).toBeUndefined();
    expect(textWrites(h, "dialogue").at(-1)?.params.instructions[0].text).toBe("Again.");
  });
});

describe("a beat displayed instantly shows no motion (#2733)", () => {
  test("in the editor preview on a line", async () => {
    const h = harness(lines(FADING), { live: false });
    await h.ready;
    expect(h.game.context.system.previewing).toBeTruthy();
    h.reset();
    await play(h, dialogueLine);
    await play(h, actionLine);
    expect(motions(h)).toEqual([]);
    const [dialogue] = h.game.module.ui.findIds("dialogue");
    expect(presenceOf(h, dialogue!)).toBeUndefined();
    expect(displayOf(h, dialogue!)).toBe("none");
  });

  test("after a step back or a loaded save", async () => {
    const h = harness(lines(FADING));
    await h.ready;
    h.reset();
    new Coordinator(h.game, { end: 0, ...dialogueLine } as any, { settled: "restored" });
    await flushMicrotasks(30);
    const [dialogue] = h.game.module.ui.findIds("dialogue");
    expect(displayOf(h, dialogue!)).toBeNull();
    expect(presenceOf(h, dialogue!)).toBeUndefined();
    expect(motions(h)).toEqual([]);
  });

  test("when a click shows the whole line, which ends the arrival at once", async () => {
    const h = harness(lines(FADING));
    await h.ready;
    const [dialogue] = h.game.module.ui.findIds("dialogue");
    const coordinator = await play(h, { ...dialogueLine, text: { dialogue: [{ text: "A long line." }] } });
    expect(presenceOf(h, dialogue!)).toBe("initial");
    h.reset();
    (coordinator as any)._finishedExecution = false;
    (coordinator as any)._startedExecution = true;
    (coordinator as any)._interacted = true;
    coordinator.onUpdate({ deltaMS: 0 } as Clock);
    await flushMicrotasks(30);
    expect(motions(h)).toEqual([]);
    expect(presenceOf(h, dialogue!)).toBeNull();
    expect(displayOf(h, dialogue!)).toBeNull();
  });
});

describe("an if branch that is added or removed (#2733)", () => {
  const BRANCH = `${NO_BOX}
store shown = false

style badge {
  @initial { opacity = 0 }
  @hide { opacity = 0 }
}

layout main {
  if shown then
    badge {
      text "!"
    }
  end
}
`;

  const refresh = (h: UIHarness, shown: boolean) => {
    (h.game.story as any).variablesState.$("shown", shown);
    h.game.module.ui.setMotion(true);
    h.game.module.ui.refreshLayouts();
  };

  test("arrives from its @initial look and stays until its @hide ends", async () => {
    const h = harness(BRANCH);
    await h.ready;
    h.reset();
    refresh(h, true);
    await flushMicrotasks(10);
    const [badge] = h.game.module.ui.findIds("badge");
    expect(presenceOf(h, badge!)).toBe("initial");
    expect(motions(h)).toEqual([{ element: badge, presence: "show" }]);
    await settle(h);
    h.reset();
    refresh(h, false);
    await flushMicrotasks(10);
    expect(motions(h)).toEqual([{ element: badge, presence: "hide" }]);
    expect(destroyed(h, badge!)).toEqual([]);
    expect(h.game.module.ui.findIds("badge")).toEqual([]);
    await settle(h);
    expect(destroyed(h, badge!)).toHaveLength(1);
  });

  test("changes at once when motion is off", async () => {
    const h = harness(BRANCH);
    await h.ready;
    h.reset();
    (h.game.story as any).variablesState.$("shown", true);
    h.game.module.ui.setMotion(false);
    h.game.module.ui.refreshLayouts();
    await flushMicrotasks(10);
    const [badge] = h.game.module.ui.findIds("badge");
    expect(presenceOf(h, badge!)).toBeUndefined();
    (h.game.story as any).variablesState.$("shown", false);
    h.game.module.ui.refreshLayouts();
    await flushMicrotasks(10);
    expect(destroyed(h, badge!)).toHaveLength(1);
    expect(motions(h)).toEqual([]);
  });
});

describe("a layout that opens or closes (#2733)", () => {
  const MENU = `${NO_BOX}
style panel {
  @initial { opacity = 0 }
  @hide { opacity = 0 }
}

layout menu {
  panel {
    text "Menu"
  }
}
`;

  const animations = (h: UIHarness) =>
    wire(h.messages).filter((m: any) => m?.method === "ui/animate");

  test("with no with clause, plays the blocks in place of the built-in show and hide", async () => {
    const h = harness(MENU);
    await h.ready;
    const ui = h.game.module.ui;
    ui.setMotion(true);
    h.reset();
    await ui.openLayout("menu");
    await flushMicrotasks(10);
    const root = (ui as any)._mountedLayouts.get("menu").element.id;
    expect(presenceOf(h, root)).toBe("initial");
    expect(motions(h)).toEqual([{ element: root, presence: "show" }]);
    expect(animations(h)).toEqual([]);
    await settle(h);
    h.reset();
    await ui.closeLayout("menu");
    await flushMicrotasks(10);
    expect(motions(h)).toEqual([{ element: root, presence: "hide" }]);
    expect(destroyed(h, root)).toEqual([]);
    expect((ui as any)._mountedLayouts.has("menu")).toBe(false);
    await settle(h);
    expect(destroyed(h, root)).toHaveLength(1);
  });

  test("with a with clause, plays the clause's animation and not the blocks", async () => {
    const h = harness(MENU);
    await h.ready;
    const ui = h.game.module.ui;
    ui.setMotion(true);
    h.reset();
    await ui.openLayout("menu", { with: "fadein" });
    await flushMicrotasks(10);
    const root = (ui as any)._mountedLayouts.get("menu").element.id;
    expect(animations(h)).toHaveLength(1);
    expect(motions(h)).toEqual([]);
    expect(presenceOf(h, root)).toBeUndefined();
    h.reset();
    await ui.closeLayout("menu", { with: "fadeout" });
    await flushMicrotasks(10);
    expect(animations(h)).toHaveLength(1);
    expect(motions(h)).toEqual([]);
    expect(destroyed(h, root)).toHaveLength(1);
  });

  test("opens and closes at once when displayed instantly", async () => {
    const h = harness(MENU);
    await h.ready;
    const ui = h.game.module.ui;
    ui.setMotion(true);
    h.reset();
    await ui.openLayout("menu", undefined, true);
    const root = (ui as any)._mountedLayouts.get("menu").element.id;
    await ui.closeLayout("menu", undefined, true);
    await flushMicrotasks(10);
    expect(motions(h)).toEqual([]);
    expect(destroyed(h, root)).toHaveLength(1);
  });
});
