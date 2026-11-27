import { describe, expect, test } from "vitest";
import { Coordinator } from "../../src/game/core/classes/Coordinator";
import { createHarness, flattenMessages, flushMicrotasks } from "./harness/uiTestHarness";

const SOURCE = `define sky as image with
  src = "https://example.com/sky.png"
end

define red as image with
  src = "https://example.com/red.png"
end

define hat as image with
  src = "https://example.com/hat.png"
end

define HERO as character with
  name = "HERO"
end

layout main {
  stage {
    backdrop {
      image
    }
    portrait #clear {
      image
    }
  }
}

layout textbox {
  textbox {
    character_name #clear {
      text
    }
    dialogue #clear {
      text
    }
    action {
      text
    }
  }
}

scene start
  [[show backdrop sky]]
  [[show portrait red]]
  HERO: First words.

  A plain action line.

  [[show portrait red]]
  HERO: Second words.

  [[show portrait hat]]
  HERO: Third words.

  Another action line.
end
`;

const textOf = (ui: any, target: string): string =>
  (ui._state.text?.[target] ?? []).map((e: any) => e.text ?? "").join("");

const picturesOf = (ui: any, target: string): string[] =>
  (ui._state.image?.[target] ?? []).flatMap((e: any) => e.assets ?? []);

async function play() {
  const h = createHarness(SOURCE);
  await h.ready;
  expect(h.errors).toEqual([]);
  const ui: any = h.game.module.ui;
  h.jumpToFlow("start");
  const states: { dialogue: string; name: string; action: string; portrait: string[]; backdrop: string[] }[] = [];
  for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
    new Coordinator(h.game, beat);
    await flushMicrotasks();
    states.push({
      dialogue: textOf(ui, "dialogue"),
      name: textOf(ui, "character_name"),
      action: textOf(ui, "action"),
      portrait: picturesOf(ui, "portrait"),
      backdrop: picturesOf(ui, "backdrop"),
    });
  }
  return { ui, states };
}

function displayOf(messages: any[], id: string): string | null | undefined {
  let display: string | null | undefined;
  for (const m of flattenMessages(messages) as any[]) {
    const params = m?.params;
    if ((m?.method === "ui/create" || m?.method === "ui/update") && params?.element === id) {
      if (params.style && "display" in params.style) {
        display = params.style.display;
      }
    }
  }
  return display;
}

describe("#clear decides which elements empty after their line (I-2732)", () => {
  test("only elements with #clear are emptied on the next line", async () => {
    const { ui } = await play();
    const transient = ui.getTransientTargets();
    expect(transient).toEqual(
      expect.arrayContaining(["portrait", "character_name", "dialogue"]),
    );
    expect(transient).not.toContain("backdrop");
    expect(transient).not.toContain("action");
  });

  test("a #clear text and picture element empty on a line that does not write to them", async () => {
    const { states } = await play();
    expect(states[0]).toMatchObject({
      dialogue: "First words.",
      name: "HERO",
      portrait: ["red"],
      backdrop: ["sky"],
    });
    expect(states[1]).toMatchObject({
      dialogue: "",
      name: "",
      action: "A plain action line.",
      portrait: [],
    });
  });

  test("a #clear element is replaced, not emptied, by a line that writes to it", async () => {
    const { states } = await play();
    expect(states[2]).toMatchObject({ dialogue: "Second words.", portrait: ["red"] });
    expect(states[3]).toMatchObject({ dialogue: "Third words.", portrait: ["hat"] });
  });

  test("an element without #clear keeps its content, even with a bare text or image child", async () => {
    const { states } = await play();
    expect(states.map((s) => s.backdrop)).toEqual([["sky"], ["sky"], ["sky"], ["sky"], ["sky"]]);
    expect(states.slice(1, 4).map((s) => s.action)).toEqual([
      "A plain action line.",
      "A plain action line.",
      "A plain action line.",
    ]);
  });

  test("an element without #clear is replaced, not added to, by the next line that writes to it", async () => {
    const { states } = await play();
    expect(states[4]).toMatchObject({ action: "Another action line.", dialogue: "", name: "" });
  });

  test("an element with no content is not on screen, with or without #clear", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const ui: any = h.game.module.ui;
    for (const target of ["action", "backdrop", "dialogue", "portrait"]) {
      const ids: string[] = ui.findIds(target);
      expect(ids.length, target).toBeGreaterThan(0);
      expect(ids.map((id) => displayOf(h.messages, id)), target).toEqual(ids.map(() => "none"));
    }
  });

  const SHARED_PREFIX = `define HERO as character with
  name = "HERO"
end

define SKY as image with
  src = "https://example.com/sky.png"
end
`;

  const SHARED_STORY = `
scene start
  Before.

  HERO: Current.
end
`;

  async function playThenRestore(layout: string, scene = SHARED_STORY) {
    const h = createHarness(SHARED_PREFIX + layout + scene);
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    h.jumpToFlow("start");
    for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
      new Coordinator(h.game, beat);
      await flushMicrotasks(20);
    }
    const offset = h.messages.length;
    const stamps = JSON.parse(
      JSON.stringify({
        textLine: ui.state.textLine,
        textWritten: ui.state.textWritten,
        textCleared: ui.state.textCleared,
      }),
    );
    await ui.onRestore();
    await flushMicrotasks(20);
    const restored = flattenMessages(h.messages.slice(offset))
      .filter((m: any) => m?.method === "ui/write-text")
      .map((m: any) => ({
        target: m.params?.target,
        elements: m.params?.elements,
        text: (m.params?.instructions ?? []).map((e: any) => e.text ?? "").join(""),
      }))
      .filter((w: { text: string }) => w.text);
    return {
      ui,
      stamps,
      restored: restored.map(({ target, text }) => ({ target, text })),
      destinations: new Map(restored.map((w) => [w.target, w.elements as string[]])),
    };
  }

  test("a restore leaves an element both targets share to the newer one and keeps the older one on its own element", async () => {
    const { ui, restored, destinations } = await playThenRestore(`
layout textbox {
  textbox {
    solo_dialogue.dialogue { text "Dialogue" }
    solo_action.action { text "Action" }
    decorative.dialogue.action { text "Decoration" }
  }
}
`);
    const [shared] = ui.findIds("decorative");
    expect(ui.findIds("action")).toContain(shared);
    expect(ui.findIds("dialogue")).toContain(shared);
    expect(restored).toEqual(
      expect.arrayContaining([
        { target: "action", text: "Before." },
        { target: "dialogue", text: "Current." },
      ]),
    );
    expect(destinations.get("action")).toEqual(ui.findIds("solo_action"));
    expect(destinations.get("dialogue")).toEqual(
      expect.arrayContaining([...ui.findIds("solo_dialogue"), shared]),
    );
  });

  test.each([
    ["with its line stamps", "two targets share", "dialogue.action", false],
    ["without line stamps", "two targets share", "dialogue.action", true],
    ["with its line stamps", "named by its one target", "action", false],
    ["without line stamps", "named by its one target", "action", true],
  ])(
    "a save %s puts back nothing on a #clear element %s when it connects, and shows its line again when the game starts",
    async (_, __, element, unstamped) => {
      const source = `
layout textbox {
  textbox { ${element} #clear { text } }
}

scene start
  First.

  Before.

  After.
end
`;
      const original = createHarness(source);
      await original.ready;
      expect(original.errors).toEqual([]);
      original.game.context.system.previewing = undefined;
      original.game.start();
      const settle = async (h: typeof original) => {
        for (let i = 0; i < 5; i += 1) {
          h.game.update({ deltaMS: 10000 } as any);
          await flushMicrotasks(30);
        }
      };
      await settle(original);
      original.game.clickedToContinue();
      await settle(original);
      const save = JSON.parse(original.game.saveHere()!.data);
      expect(save.shown).toBeDefined();
      expect(save.modules.ui.text.action.map((s: any) => s.text).join("")).toBe("Before.");
      if (unstamped) {
        delete save.modules.ui.textLine;
        delete save.modules.ui.textWritten;
        delete save.modules.ui.textCleared;
      }
      const h = createHarness(source, 0, {
        beforeConnect: (game) => {
          expect(game.loadToResume(JSON.stringify(save))).toBe(true);
        },
      });
      await h.ready;
      const actionWrites = (from: number) =>
        flattenMessages(h.messages.slice(from))
          .filter((m: any) => m?.method === "ui/write-text" && m.params?.target === "action")
          .map((m: any) => m.params.instructions.map((e: any) => e.text ?? "").join(""))
          .filter(Boolean);
      expect(actionWrites(0)).toEqual([]);
      const connected = h.messages.length;
      h.game.context.system.previewing = undefined;
      h.game.start();
      await settle(h);
      expect(actionWrites(connected)).toContain("Before.");
      expect(actionWrites(connected)).not.toContain("First.");
    },
  );

  test("a restore records no line stamp", async () => {
    const { ui, stamps } = await playThenRestore(`
layout textbox {
  textbox { dialogue.action { text "Says:" } }
}
`);
    expect(stamps).toEqual({
      textLine: ui.state.textLine,
      textWritten: ui.state.textWritten,
      textCleared: ui.state.textCleared,
    });
  });

  test("line stamps stay numbered one up in the order their lines ran", async () => {
    const h = createHarness(`
layout textbox {
  textbox {
    action { text }
    title { text }
  }
}

scene start
  One.

  ^: Two

  Three.

  Four.
end
`);
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    h.jumpToFlow("start");
    const seen: number[] = [];
    for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
      new Coordinator(h.game, beat);
      await flushMicrotasks(20);
      seen.push(ui.state.textLine);
    }
    expect(ui.state.textWritten).toEqual({ title: 1, action: 2 });
    expect(Object.values(ui.state.textCleared).every((v) => v === 1 || v === 2)).toBe(true);
    expect(seen).toEqual([1, 2, 2, 2]);
  });

  const CHOICE_SOURCE = `
layout textbox {
  choices {
    choice.0 { text }
    choice.1 { text }
  }
  textbox { action #clear { text } }
}

scene start
  Before.

  The gate.
  choose
    * [Pay.]
      Paid.
    * [Climb.]
      Climbed.
  end
end
`;

  test("choosing a choice drops every choice's saved text and its write stamp", async () => {
    const h = createHarness(CHOICE_SOURCE);
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    h.jumpToFlow("start");
    let menu: any;
    for (let beat = h.nextBeat(); beat && !menu; beat = h.nextBeat()) {
      const coordinator = new Coordinator(h.game, beat);
      await flushMicrotasks(20);
      if (beat.choices?.length) {
        menu = coordinator;
      }
    }
    expect(menu).toBeDefined();
    const line = ui.state.textLine;
    for (const target of ["choice 0", "choice 1"]) {
      expect(ui.state.text?.[target], target).toBeDefined();
      expect(ui.state.textWritten?.[target], target).toBe(line);
    }
    menu.choose(0);
    for (const target of ["choice 0", "choice 1"]) {
      expect(ui.state.text?.[target], target).toBeUndefined();
      expect(ui.state.textWritten?.[target], target).toBeUndefined();
    }
  });

  test("rolling back from a choice menu leaves the destination's line stamps as they were saved", async () => {
    const h = createHarness(CHOICE_SOURCE);
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    h.game.context.system.previewing = undefined;
    h.game.start();
    const settle = async () => {
      for (let i = 0; i < 5; i += 1) {
        h.game.update({ deltaMS: 10000 } as any);
        await flushMicrotasks(30);
      }
    };
    const stampsNow = () =>
      JSON.parse(JSON.stringify([ui.state.textLine, ui.state.textWritten, ui.state.textCleared]));
    await settle();
    expect(ui.state.text?.action?.map((s: any) => s.text).join("")).toBe("Before.");
    const saved = stampsNow();
    for (let i = 0; i < 8 && h.game.story.currentChoices.length === 0; i += 1) {
      h.game.clickedToContinue();
      await settle();
    }
    expect(h.game.story.currentChoices.length).toBeGreaterThan(0);
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    expect(stampsNow()).toEqual(saved);
  });

  test("previewing a line past a choice menu leaves no choice to put back on a restore", async () => {
    const source = `${CHOICE_SOURCE}
scene elsewhere
  Elsewhere.
end
`;
    const lineOf = (text: string) => source.split("\n").findIndex((l) => l.includes(text));
    const writes = (from: number) =>
      flattenMessages(h.messages.slice(from))
        .filter((m: any) => m?.method === "ui/write-text")
        .map((m: any) => (m.params?.instructions ?? []).map((e: any) => e.text ?? "").join(""))
        .filter(Boolean);
    const h = createHarness(source);
    await h.ready;
    expect(h.errors).toEqual([]);
    await h.preview(lineOf("  choose"));
    await flushMicrotasks(30);
    expect(writes(0)).toContain("Pay.");
    await h.preview(lineOf("Elsewhere."));
    await flushMicrotasks(30);
    const offset = h.messages.length;
    await h.game.module.ui.onRestore();
    await flushMicrotasks(30);
    expect(writes(offset).filter((t) => t === "Pay." || t === "Climb.")).toEqual([]);
  });

  test.each([
    ["with its line stamps", false],
    ["without line stamps", true],
  ])(
    "a save %s keeps an earlier line on an element without #clear that another name wrote when the game resumes",
    async (_, unstamped) => {
      const source = `${SHARED_PREFIX}
layout textbox {
  textbox {
    title.action { text }
    dialogue #clear { text }
  }
}

scene start
  Keep this action.

  HERO: Current dialogue.

  HERO: Later dialogue.
end
`;
      const settle = async (h: ReturnType<typeof createHarness>) => {
        for (let i = 0; i < 5; i += 1) {
          h.game.update({ deltaMS: 10000 } as any);
          await flushMicrotasks(30);
        }
      };
      const original = createHarness(source);
      await original.ready;
      expect(original.errors).toEqual([]);
      original.game.context.system.previewing = undefined;
      original.game.start();
      await settle(original);
      original.game.clickedToContinue();
      await settle(original);
      const save = JSON.parse(original.game.saveHere()!.data);
      expect(save.modules.ui.text.action.map((s: any) => s.text).join("")).toBe("Keep this action.");
      expect(save.modules.ui.text.dialogue.map((s: any) => s.text).join("")).toBe("Current dialogue.");
      if (unstamped) {
        delete save.modules.ui.textLine;
        delete save.modules.ui.textWritten;
        delete save.modules.ui.textCleared;
      }
      const h = createHarness(source, 0, {
        beforeConnect: (game) => {
          expect(game.loadToResume(JSON.stringify(save))).toBe(true);
        },
      });
      await h.ready;
      h.game.context.system.previewing = undefined;
      h.game.start();
      await settle(h);
      const actionWrites = flattenMessages(h.messages)
        .filter((m: any) => m?.method === "ui/write-text" && m.params?.target === "action")
        .map((m: any) => m.params.instructions.map((e: any) => e.text ?? "").join(""));
      expect(actionWrites).toContain("Keep this action.");
    },
  );

  test("a stream's templates leave an element of the same name outside the stream on screen", async () => {
    const h = createHarness(`${SHARED_PREFIX}
layout main {
  action { text "Ready" }
  stream {
    action { text }
  }
}

layout textbox {
  textbox { dialogue #clear { text } }
}

scene start
  HERO: Hello.
end
`);
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    const ids: string[] = ui.findIds("action");
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.map((id) => displayOf(h.messages, id))).not.toContain("none");
  });

  test("rolling back puts back the text a shared element held through a line that wrote elsewhere, and rolling forward puts back the later line", async () => {
    const h = createHarness(`define HERO as character with
  name = "HERO"
end

layout main {
  textbox {
    dialogue.action { text "Default" }
    title { text "Title" }
  }
}

scene start
  Before.

  ^: Interlude

  HERO: Current.

  After.
end
`);
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    h.game.context.system.previewing = undefined;
    h.game.start();
    const settleBeat = async () => {
      for (let i = 0; i < 5; i += 1) {
        h.game.update({ deltaMS: 10000 } as any);
        await flushMicrotasks(30);
      }
    };
    await settleBeat();
    h.game.clickedToContinue();
    await settleBeat();
    expect(ui.state.text?.action?.map((s: any) => s.text).join("")).toBe("Before.");
    h.game.clickedToContinue();
    await settleBeat();
    h.reset();
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    const written = flattenMessages(h.messages)
      .filter((m: any) => m?.method === "ui/write-text" && m.params?.target === "action")
      .map((m: any) => m.params.instructions.map((e: any) => e.text ?? "").join(""));
    expect(written).toContain("Before.");
    h.reset();
    const forward = await h.game.rollForward("beat");
    expect(forward.moved).toBe(true);
    const ahead = flattenMessages(h.messages)
      .filter((m: any) => m?.method === "ui/write-text" && m.params?.target === "dialogue")
      .map((m: any) => m.params.instructions.map((e: any) => e.text ?? "").join(""));
    expect(ahead).toContain("Current.");
  });

  test("a restore puts back only the newest line's text on an element two targets share", async () => {
    const { ui, restored } = await playThenRestore(`
layout textbox {
  textbox {
    dialogue.action {
      text "Says:"
    }
  }
}
`);
    expect(ui.findIds("dialogue")).toEqual(ui.findIds("action"));
    expect(restored).toEqual([{ target: "dialogue", text: "Current." }]);
  });

  test("a restore keeps a target's text on its own element when another element carries both names", async () => {
    const { ui, restored } = await playThenRestore(`
layout textbox {
  textbox {
    dialogue { text "Dialogue" }
    action { text "Action" }
    decorative.dialogue.action { text "Decoration" }
  }
}
`);
    expect(ui.findIds("dialogue")).not.toEqual(ui.findIds("action"));
    expect(restored).toEqual(
      expect.arrayContaining([
        { target: "action", text: "Before." },
        { target: "dialogue", text: "Current." },
      ]),
    );
    expect(restored).toHaveLength(2);
  });

  test("a restore puts back only the newest line's text on a shared element inside a component", async () => {
    const { ui, restored } = await playThenRestore(`
component shared_box {
  dialogue.action { text "Says:" }
}

layout textbox {
  textbox { shared_box }
}
`);
    expect(ui.findIds("dialogue").length).toBeGreaterThan(0);
    expect(ui.findIds("dialogue")).toEqual(ui.findIds("action"));
    expect(restored).toEqual([{ target: "dialogue", text: "Current." }]);
  });

  test("a restore puts nothing back on a #clear element a later line emptied, whichever name wrote it", async () => {
    const { ui, restored } = await playThenRestore(
      `
layout textbox {
  textbox { dialogue.action #clear { text } }
}
`,
      `
scene start
  Before.

  [[show backdrop SKY]]
end
`,
    );
    expect(ui.getTransientTargets()).toContain("dialogue action");
    expect(restored).toEqual([]);
  });
});
