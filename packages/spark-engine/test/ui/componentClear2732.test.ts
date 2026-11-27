import { describe, expect, test } from "vitest";
import { Coordinator } from "../../src/game/core/classes/Coordinator";
import { compileUI, createHarness, flattenMessages, flushMicrotasks } from "./harness/uiTestHarness";

const PREFIX = `define SKY as image with
  src = "https://example.com/sky.png"
end
`;

const KINDS = [
  ["text", "title", "text", "^: Chapter One", "ui/write-text"],
  ["picture", "badge", "image", "[[show badge SKY]]\n  A sky.", "ui/write-image"],
] as const;

const source = (tag: string, leaf: string, line: string, mark: string, uses: number) => `${PREFIX}
component banner {
  frame { ${tag}${mark} { ${leaf} } }
}

layout textbox {
  textbox {
    action #clear { text }
${Array.from({ length: uses }, () => "    banner()").join("\n")}
  }
}

scene start
  ${line}

  First line.
end
`;

async function play(text: string) {
  const h = createHarness(text);
  await h.ready;
  expect(h.errors).toEqual([]);
  const ui: any = h.game.module.ui;
  h.jumpToFlow("start");
  const beats: number[] = [];
  for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
    beats.push(h.messages.length);
    new Coordinator(h.game, beat);
    await flushMicrotasks(20);
  }
  return { h, ui, beats };
}

const writes = (messages: any[], method: string, target: string) =>
  (flattenMessages(messages) as any[]).filter((m) => m?.method === method && m.params?.target === target);

const isClear = (m: any) => (m.params?.instructions ?? []).length === 0;

describe("#clear on an element inside a component (I-2732)", () => {
  describe.each(KINDS)("%s", (_, tag, leaf, line, method) => {
    test.each([1, 2])("used %s time(s): every copy empties at the next line, and a reconnect puts back none", async (uses) => {
      const { h, ui, beats } = await play(source(tag, leaf, line, " #clear", uses));
      const ids: string[] = ui.findIds(tag);
      expect(ids).toHaveLength(uses);
      const paths = (ui.textElements(tag) as any[]).map((el) => ui.elementPath(el));
      expect(new Set(paths).size).toBe(uses);
      for (const path of paths) {
        expect(path).toMatch(/^layout:textbox@[0-9a-f]{16}\/0\/[0-9]+>banner\/0\/0$/);
      }
      const shown = writes(h.messages.slice(beats[0], beats[1]), method, tag).filter((m) => !isClear(m));
      expect(shown.flatMap((m) => m.params.elements ?? ids).sort()).toEqual([...ids].sort());
      const emptied = writes(h.messages.slice(beats[1]), method, tag)
        .filter(isClear)
        .flatMap((m) => m.params.elements ?? ids);
      for (const id of ids) {
        expect(emptied).toContain(id);
      }
      const from = h.messages.length;
      await h.reconnect();
      await flushMicrotasks(30);
      expect(writes(h.messages.slice(from), method, tag).filter((m) => !isClear(m))).toEqual([]);
    });

    test.each([1, 2])("used %s time(s) without #clear: every copy keeps its content, as the old rule left it", async (uses) => {
      const { h, ui, beats } = await play(source(tag, leaf, line, "", uses));
      const ids: string[] = ui.findIds(tag);
      expect(ids).toHaveLength(uses);
      const emptied = writes(h.messages.slice(beats[1]), method, tag)
        .filter(isClear)
        .flatMap((m) => m.params.elements ?? ids);
      expect(emptied.filter((id) => ids.includes(id))).toEqual([]);
    });
  });

  test("the marks recorded before connecting, as the checkpoint builder records them, are the paths the mounted copies get", async () => {
    let recorded: string[] = [];
    const h = createHarness(source("title", "text", "^: Chapter One", " #clear", 2), 0, {
      beforeConnect: (game) => {
        recorded = [...((game.module.ui as any)._clearPaths.get("title") ?? [])].filter((path: string) =>
          path.startsWith("layout:textbox@"),
        );
      },
    });
    await h.ready;
    const ui: any = h.game.module.ui;
    expect(recorded).toHaveLength(2);
    expect((ui.textElements("title") as any[]).map((el) => ui.elementPath(el)).sort()).toEqual([...recorded].sort());
  });

  test("a #clear inside a component that another component calls empties at the next line", async () => {
    const { h, ui, beats } = await play(`${PREFIX}
component crest {
  title #clear { text }
}

component banner {
  frame { crest() }
}

layout textbox {
  textbox {
    action #clear { text }
    banner()
  }
}

scene start
  ^: Chapter One

  First line.
end
`);
    const [el] = ui.textElements("title") as any[];
    expect(ui.elementPath(el)).toMatch(/>banner\/0\/0>crest\/0$/);
    const ids: string[] = ui.findIds("title");
    const emptied = writes(h.messages.slice(beats[1]), "ui/write-text", "title")
      .filter(isClear)
      .flatMap((m) => m.params.elements ?? ids);
    expect(emptied).toContain(el.id);
  });

  test("editing a component's body changes the key root of the layout that calls it", () => {
    const rootOf = (mark: string) => {
      const h = createHarness(source("title", "text", "^: Chapter One", mark, 1), 0, { connect: false });
      return (h.game.module.ui as any)._roots.get("layout:textbox");
    };
    expect(rootOf("")).toMatch(/^layout:textbox@[0-9a-f]{16}$/);
    expect(rootOf(" #clear")).not.toBe(rootOf(""));
    const { errors } = compileUI(source("title", "text", "^: Chapter One", " #clear", 1));
    expect(errors).toEqual([]);
  });
});
