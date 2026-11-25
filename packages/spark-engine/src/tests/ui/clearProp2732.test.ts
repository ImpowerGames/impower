import { describe, expect, test } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
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

  test("a line that writes to an element shared by two targets drops the other target's saved text", async () => {
    const h = createHarness(`define HERO as character with
  name = "HERO"
end

layout textbox {
  textbox {
    dialogue.action {
      text "Says:"
    }
  }
}

scene start
  Before.

  HERO: Current.
end
`);
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    h.jumpToFlow("start");
    const seen: { action: string; dialogue: string }[] = [];
    for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
      new Coordinator(h.game, beat);
      await flushMicrotasks();
      seen.push({ action: textOf(ui, "action"), dialogue: textOf(ui, "dialogue") });
    }
    expect(seen).toEqual([
      { action: "Before.", dialogue: "" },
      { action: "", dialogue: "Current." },
    ]);
  });
});
