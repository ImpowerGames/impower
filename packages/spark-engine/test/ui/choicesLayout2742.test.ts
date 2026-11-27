import { describe, expect, test } from "vitest";
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
    expect(shownText(h, "choice 1")).toBe("Go.");

    await pickFirst(h);
    expect(mounted(h)).toEqual(["dialogue"]);
    expect(shownText(h, "dialogue")).toBe("Stayed.");
  });
});
