import { describe, expect, test } from "vitest";
import { EventMessage } from "../../src/game/core/classes/messages/EventMessage";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFS = `define MARA as character with
  name = "MARA"
end
`;

type Harness = ReturnType<typeof createHarness>;

interface TreeElement {
  id: string;
  name: string;
  parent: TreeElement | null;
  children: TreeElement[];
}

const ui = (h: Harness): any => h.game.module.ui;

const findAll = (h: Harness, name: string): TreeElement[] => {
  const out: TreeElement[] = [];
  const walk = (el: TreeElement | undefined) => {
    if (!el) {
      return;
    }
    if (el.name.split(" ").includes(name)) {
      out.push(el);
    }
    el.children.forEach(walk);
  };
  walk(ui(h)._root);
  return out;
};

const mounted = (h: Harness): string[] =>
  [...ui(h)._mountedLayouts.keys()].filter(
    (name: string) => !["main", "loading", "ending"].includes(name),
  );

const shownText = (h: Harness, target: string): string =>
  (ui(h)._state.text?.[target] ?? []).map((e: any) => e.text ?? "").join("");

const beat = (h: Harness): any => (h.game as any)._coordinator?._instructions;

async function play(source: string, opts?: Parameters<typeof createHarness>[2]) {
  const h = createHarness(`${DEFS}\n${source}`, 0, {
    autoOpenAll: false,
    ...opts,
  });
  await h.ready;
  expect(h.errors).toEqual([]);
  h.game.context.system.previewing = undefined;
  h.game.start();
  await settle(h);
  return h;
}

async function settle(h: Harness) {
  for (let tick = 0; tick < 4; tick += 1) {
    await flushMicrotasks(10);
    (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
  }
  await flushMicrotasks(10);
}

async function click(h: Harness) {
  h.game.clickedToContinue();
  await settle(h);
}

const written = (h: Harness): string[] =>
  Object.keys(ui(h)._state.text ?? {})
    .filter((target) => target.startsWith("choice "))
    .sort()
    .map((target) => shownText(h, target));

const pressable = (h: Harness): string[] => {
  const handlers = ui(h)._events.click ?? {};
  return (ui(h).findIds("choice") as string[]).filter((id) =>
    Object.hasOwn(handlers, id),
  );
};

const keydown = (key: string) =>
  EventMessage.type.notification({ type: "keydown", key } as never);

async function pickFirst(h: Harness) {
  const [first] = ui(h).findIds("choice 0");
  h.emitEvent("click", first, { button: 0 });
  await settle(h);
}

const MENU = `  MARA: Stay or go?
  choose
    + [Stay.]
      MARA: Stayed.
    + [Go.]
      MARA: Gone.
  end
end
`;

const QUESTION = `scene start
${MENU}`;

const CAPTIONED = `scene start
  choose
    Which way?
    + [Left]
      You went left.
    + [Right]
      You went right.
  end
end
`;

describe("a menu shows in its own choices layout (I-2742)", () => {
  test("choices opens beside the question's box, which keeps its line, and closes on a pick", async () => {
    const h = await play(`style textbox {
  @showing(choices) {
    opacity = 0.9
  }
}

${QUESTION}`);
    expect(beat(h).kind).toBe("dialogue");
    expect(mounted(h)).toEqual(["dialogue"]);

    await click(h);
    expect(beat(h).choices).toEqual(["choice 0", "choice 1"]);
    expect(mounted(h)).toEqual(["dialogue", "choices"]);
    expect(shownText(h, "dialogue")).toBe("Stay or go?");
    expect(shownText(h, "character_name")).toBe("MARA");
    expect(findAll(h, "textbox")).toHaveLength(1);
    expect(findAll(h, "choice")).toHaveLength(6);
    expect(shownText(h, "choice 0")).toBe("Stay.");
    expect(ui(h).showingNames()).toContain("choices");

    await pickFirst(h);
    expect(beat(h).kind).toBe("dialogue");
    expect(mounted(h)).toEqual(["dialogue"]);
    expect(shownText(h, "dialogue")).toBe("Stayed.");
    expect(findAll(h, "choice")).toEqual([]);
    expect(ui(h).showingNames()).not.toContain("choices");
  });

  test("a menu whose question is its caption opens the caption's box and choices together, and a pick closes choices", async () => {
    const h = await play(CAPTIONED);
    expect(beat(h).choices).toEqual(["choice 0", "choice 1"]);
    expect(mounted(h)).toEqual(["action", "choices"]);
    expect(shownText(h, "action")).toBe("Which way?");
    expect(findAll(h, "choice")).toHaveLength(6);
    expect(shownText(h, "choice 1")).toBe("Right");

    await pickFirst(h);
    expect(mounted(h)).toEqual(["action"]);
    expect(shownText(h, "action")).toBe("You went left.");
  });

  test("a captioned menu shows its options in an author's own choices layout", async () => {
    const h = await play(`layout choices {
  choices {
    choice.0 #clear { text }
    choice.1 #clear { text }
    choice.2 #clear { text }
  }
}

style choices {
  transition = opacity 0.2s
  @initial { opacity = 0 }
  @hide { opacity = 0 }
}

${CAPTIONED}`);
    expect(mounted(h)).toEqual(["action", "choices"]);
    expect(shownText(h, "action")).toBe("Which way?");
    expect(findAll(h, "choice")).toHaveLength(3);
    expect(shownText(h, "choice 0")).toBe("Left");
  });

  test("a pick leaves the option buttons on screen and written while choices plays its @hide", async () => {
    const h = createHarness(
      `${DEFS}
layout choices {
  choices {
    choice.0 #clear { text }
    choice.1 #clear { text }
  }
}

style choices {
  transition = opacity 0.2s
  @initial { opacity = 0 }
  @hide { opacity = 0 }
}

${QUESTION}`,
      0,
      { autoOpenAll: false, holdPresence: true },
    );
    await h.ready;
    h.game.context.system.previewing = undefined;
    h.game.start();
    const settleReleasing = async () => {
      for (let tick = 0; tick < 8; tick += 1) {
        h.releasePresence();
        await flushMicrotasks(10);
        (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
      }
      await flushMicrotasks(10);
    };
    await settleReleasing();
    h.game.clickedToContinue();
    await settleReleasing();
    expect(mounted(h)).toEqual(["dialogue", "choices"]);
    const options: string[] = ui(h).findIds("choice");
    expect(options).toHaveLength(2);

    h.reset();
    await pickFirst(h);
    const sent = (m: any): any[] => [m, ...(m.params?.messages ?? []).flatMap(sent)];
    const touched = h.messages
      .flatMap(sent)
      .filter(
        (m: any) =>
          (m.method === "ui/update" &&
            options.includes(m.params.element) &&
            m.params.style?.display === "none") ||
          (m.method === "ui/write-text" &&
            options.some((id) => [m.params.element, m.params.target].includes(id))),
      );
    const departures = h
      .heldPresence()
      .flatMap((m: any) => m.params.effects ?? [])
      .filter((effect: any) => effect.presence === "hide");
    expect(departures.length).toBeGreaterThan(0);
    expect(touched).toEqual([]);
  });

  test("a pick that ends the story closes choices", async () => {
    const h = await play(`scene start
  MARA: Stay or go?
  choose
    + [Stay.]
      -> DONE
    + [Go.]
      -> DONE
  end
end
`);
    await click(h);
    expect(mounted(h)).toEqual(["dialogue", "choices"]);
    await pickFirst(h);
    expect(mounted(h)).not.toContain("choices");
  });

  test("two menus in a row keep choices open with only the second menu's buttons, under the first menu's question", async () => {
    const h = await play(`scene start
  MARA: Stay or go?
  choose
    + [Stay.]
      choose
        + [Sit.]
          MARA: Sat.
        + [Stand.]
          MARA: Stood.
      end
    + [Go.]
      MARA: Gone.
    + [Wait.]
      MARA: Waited.
  end
end
`);
    await click(h);
    expect(written(h)).toEqual(["Stay.", "Go.", "Wait."]);
    await pickFirst(h);
    expect(beat(h).choices).toEqual(["choice 0", "choice 1"]);
    expect(mounted(h)).toEqual(["dialogue", "choices"]);
    expect(shownText(h, "dialogue")).toBe("Stay or go?");
    expect(written(h)).toEqual(["Sit.", "Stand."]);
    expect(pressable(h)).toHaveLength(2);

    h.emitEvent("click", ui(h).findIds("choice 1")[0], { button: 0 });
    await settle(h);
    expect(mounted(h)).toEqual(["dialogue"]);
    expect(shownText(h, "dialogue")).toBe("Stood.");
    expect(findAll(h, "choice")).toEqual([]);
  });

  test("a pick that jumps into another scene's menu shows only that menu's buttons", async () => {
    const h = await play(`scene start
  MARA: Stay or go?
  choose
    + [Stay.]
      -> porch
    + [Go.]
      MARA: Gone.
  end
end

scene porch
  choose
    + [Knock.]
      MARA: Knocked.
  end
end
`);
    await click(h);
    await pickFirst(h);
    expect(beat(h).choices).toEqual(["choice 0"]);
    expect(mounted(h)).toContain("choices");
    expect(written(h)).toEqual(["Knock."]);
    expect(pressable(h)).toHaveLength(1);
  });

  test("a pick followed by a beat that shows only a picture closes choices and leaves no buttons", async () => {
    const h = await play(`define sky as image with
  src = "https://example.com/sky.png"
end

scene start
  MARA: Stay or go?
  choose
    + [Stay.]
      [[show backdrop sky]]
      >
      MARA: Stayed.
    + [Go.]
      MARA: Gone.
  end
end
`);
    await click(h);
    await pickFirst(h);
    expect(Object.keys(beat(h).image ?? {})).toEqual(["backdrop"]);
    expect(mounted(h)).not.toContain("choices");
    expect(findAll(h, "choice")).toEqual([]);
    expect(pressable(h)).toEqual([]);
    await click(h);
    expect(shownText(h, "dialogue")).toBe("Stayed.");
    expect(findAll(h, "choice")).toEqual([]);
  });

  test("stepping back across a pick shows the menu again with its buttons pressable", async () => {
    const h = await play(QUESTION);
    await click(h);
    await pickFirst(h);
    expect(shownText(h, "dialogue")).toBe("Stayed.");
    const back = await h.game.rollBack("beat");
    await settle(h);
    expect(back.moved).toBe(true);
    expect(beat(h).choices).toEqual(["choice 0", "choice 1"]);
    expect(mounted(h)).toEqual(["dialogue", "choices"]);
    expect(written(h)).toEqual(["Stay.", "Go."]);
    expect(pressable(h)).toHaveLength(2);

    h.emitEvent("click", ui(h).findIds("choice 1")[0], { button: 0 });
    await settle(h);
    expect(shownText(h, "dialogue")).toBe("Gone.");
    expect(findAll(h, "choice")).toEqual([]);
  });

  test("a preview onto the menu line shows its buttons, and a preview off it shows none", async () => {
    const source = `${DEFS}\n${QUESTION}`;
    const lineOf = (text: string) =>
      source.split("\n").findIndex((line) => line.includes(text));
    const h = createHarness(source, 0, { autoOpenAll: false });
    await h.ready;
    expect(h.errors).toEqual([]);

    await h.preview(lineOf("  choose"));
    await settle(h);
    expect(mounted(h)).toContain("choices");
    expect(written(h)).toEqual(["Stay.", "Go."]);
    expect(pressable(h)).toHaveLength(2);

    await h.preview(lineOf("Stay or go?"));
    await settle(h);
    expect(mounted(h)).toEqual(["dialogue"]);
    expect(findAll(h, "choice")).toEqual([]);

    await h.preview(lineOf("  choose"));
    await settle(h);
    expect(written(h)).toEqual(["Stay.", "Go."]);

    await h.preview(lineOf("Stayed."));
    await settle(h);
    expect(mounted(h)).toEqual(["dialogue"]);
    expect(shownText(h, "dialogue")).toBe("Stayed.");
    expect(findAll(h, "choice")).toEqual([]);
  });

  test("a button kept after the pick cannot be picked again or focused, by pointer or by keyboard", async () => {
    const h = createHarness(
      `${DEFS}
${QUESTION.replace("    + [Go.]", "    + [Wait.]\n      MARA: Waited.\n    + [Go.]")}`,
      0,
      { autoOpenAll: false, holdPresence: true },
    );
    await h.ready;
    h.game.context.system.previewing = undefined;
    h.game.start();
    const advance = async (release: boolean) => {
      for (let tick = 0; tick < 8; tick += 1) {
        if (release) {
          h.releasePresence();
        }
        await flushMicrotasks(10);
        (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
      }
      await flushMicrotasks(10);
    };
    await advance(true);
    h.game.clickedToContinue();
    await advance(true);
    expect(written(h)).toEqual(["Stay.", "Wait.", "Go."]);
    const menu = (h.game as any)._coordinator;
    const options: string[] = beat(h).choices.flatMap((target: string) => ui(h).findIds(target));

    h.reset();
    h.emitEvent("click", ui(h).findIds("choice 0")[0], { button: 0 });
    await advance(false);
    expect(pressable(h)).toEqual([]);
    const sentSoFar = (m: any): any[] => [m, ...(m.params?.messages ?? []).flatMap(sentSoFar)];
    const unmarked = new Set(
      h.messages
        .flatMap(sentSoFar)
        .filter(
          (m: any) =>
            m.method === "ui/update" &&
            m.params.attributes?.["data-ui-handler"] === null,
        )
        .map((m: any) => m.params.element),
    );
    expect(options.filter((id) => !unmarked.has(id))).toEqual([]);
    h.emitEvent("click", ui(h).findIds("choice 1")[0], { button: 0 });
    for (const coordinator of new Set([menu, (h.game as any)._coordinator])) {
      coordinator?.onMessage(keydown("2"));
      coordinator?.onMessage(keydown("ArrowDown"));
      coordinator?.onMessage(keydown("Enter"));
    }
    await advance(false);
    const sent = (m: any): any[] => [m, ...(m.params?.messages ?? []).flatMap(sent)];
    const all = h.messages.flatMap(sent);
    expect(
      all.filter((m: any) => m.method === "game/chosePathToContinue"),
    ).toHaveLength(1);
    expect(
      all.filter(
        (m: any) =>
          m.method === "ui/update" &&
          options.includes(m.params.element) &&
          m.params.attributes &&
          "data-focused" in m.params.attributes,
      ),
    ).toEqual([]);
    await advance(true);
    expect(shownText(h, "dialogue")).toBe("Stayed.");
  });

  test("an action line after the pick closes choices and the question's box, and opens action", async () => {
    const h = await play(`scene start
  MARA: Stay or go?
  choose
    + [Stay.]
      She stays.
    + [Go.]
      She goes.
  end
end
`);
    await click(h);
    expect(mounted(h)).toEqual(["dialogue", "choices"]);
    await pickFirst(h);
    expect(mounted(h)).toEqual(["action"]);
    expect(shownText(h, "action")).toBe("She stays.");
  });

  test("a menu shown in a layout the author opened, which holds the option buttons, keeps choices closed", async () => {
    const h = await play(`layout picker {
  choice.0 #clear { text }
  choice.1 #clear { text }
}

scene start
  [[open picker]]
${MENU}`);
    await click(h);
    expect(beat(h).choices).toHaveLength(2);
    expect(mounted(h)).toEqual(["picker", "dialogue"]);
    expect(findAll(h, "choice")).toHaveLength(2);
    expect(shownText(h, "choice 1")).toBe("Go.");
  });

  test("a project whose own main holds the option buttons keeps its menu there", async () => {
    const h = await play(`layout main {
  dialogue #clear { text }
  choice.0 #clear { text }
  choice.1 #clear { text }
}

${QUESTION}`);
    await click(h);
    expect(beat(h).choices).toHaveLength(2);
    expect(mounted(h)).toEqual([]);
    expect(findAll(h, "choice")).toHaveLength(2);
    expect(shownText(h, "dialogue")).toBe("");
  });

  test("a checkpoint taken at a menu restores the open choices layout", async () => {
    const original = await play(QUESTION);
    await click(original);
    expect(mounted(original)).toEqual(["dialogue", "choices"]);
    const checkpoint = original.game.save();

    const h = createHarness(`${DEFS}\n${QUESTION}`, 0, {
      autoOpenAll: false,
      loadCheckpoint: checkpoint,
    });
    await h.ready;
    await flushMicrotasks(10);
    expect(mounted(h)).toEqual(["dialogue", "choices"]);
    expect(findAll(h, "choice")).toHaveLength(6);
  });

  test("a save taken at a menu resumes with the question in its box and the options in choices", async () => {
    const original = await play(QUESTION);
    await click(original);
    const saved = original.game.saveHere()!.data;

    const h = createHarness(`${DEFS}\n${QUESTION}`, 0, {
      autoOpenAll: false,
      beforeConnect: (game) => expect(game.loadToResume(saved)).toBe(true),
    });
    await h.ready;
    h.game.context.system.previewing = undefined;
    h.game.start();
    await settle(h);
    expect(beat(h).choices).toEqual(["choice 0", "choice 1"]);
    expect(mounted(h)).toEqual(["dialogue", "choices"]);
    expect(shownText(h, "dialogue")).toBe("Stay or go?");
    expect(written(h)).toEqual(["Stay.", "Go."]);
    expect(pressable(h)).toHaveLength(2);

    await pickFirst(h);
    expect(mounted(h)).toEqual(["dialogue"]);
    expect(shownText(h, "dialogue")).toBe("Stayed.");
  });
});
