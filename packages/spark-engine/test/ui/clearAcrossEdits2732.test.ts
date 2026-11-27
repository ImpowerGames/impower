import { describe, expect, test } from "vitest";
import { compileUI, createHarness, flattenMessages, flushMicrotasks, type UIHarness } from "./harness/uiTestHarness";

const PREFIX = `define HERO as character with
  name = "HERO"
end

define SKY as image with
  src = "https://example.com/sky.png"
end

store shown = true
`;

const KINDS = {
  text: {
    tag: "title",
    body: "{ text }",
    method: "ui/write-text",
    saved: "textCleared",
    scene: `
scene start
  ^: Chapter One

  First line.
end
`,
  },
  picture: {
    tag: "portrait",
    body: "{ image }",
    method: "ui/write-image",
    saved: "pictureCleared",
    scene: `
scene start
  [[show portrait SKY]]
  A sky.

  First line.
end
`,
  },
} as const;

type Kind = (typeof KINDS)[keyof typeof KINDS];

const layout = (name: string, children: string) => `
layout ${name} {
  textbox {
${children}
    action #clear { text }
  }
}
`;

const BEFORE = (k: Kind) => layout("textbox", `    ${k.tag} #clear ${k.body}\n    ${k.tag} ${k.body}`);

const EDITS: [string, (k: Kind) => string, ("marked" | "kept")[]][] = [
  ["nothing edited", BEFORE, ["marked", "kept"]],
  [
    "an element inserted before the marked one",
    (k) => layout("textbox", `    ${k.tag} ${k.body}\n    ${k.tag} #clear ${k.body}\n    ${k.tag} ${k.body}`),
    ["kept", "marked", "kept"],
  ],
  ["the marked element removed", (k) => layout("textbox", `    ${k.tag} ${k.body}`), ["kept"]],
  [
    "the two reordered",
    (k) => layout("textbox", `    ${k.tag} ${k.body}\n    ${k.tag} #clear ${k.body}`),
    ["kept", "marked"],
  ],
  [
    "the marked element wrapped in an if",
    (k) => layout("textbox", `    if shown then\n      ${k.tag} #clear ${k.body}\n    end\n    ${k.tag} ${k.body}`),
    ["marked", "kept"],
  ],
  [
    "the layout renamed",
    (k) => layout("box", `    ${k.tag} #clear ${k.body}\n    ${k.tag} ${k.body}`),
    ["marked", "kept"],
  ],
];

const inLayout = (path: string | undefined, name: string) =>
  !!path && (path.startsWith(`layout:${name}@`) || path.startsWith(`layout:${name}/`));

async function settle(h: UIHarness) {
  for (let i = 0; i < 5; i += 1) {
    h.game.update({ deltaMS: 10000 } as any);
    await flushMicrotasks(30);
  }
}

async function playToSecondLine(source: string, expectedErrors: number = 0) {
  const h = createHarness(source);
  await h.ready;
  expect(h.errors).toHaveLength(expectedErrors);
  h.game.context.system.previewing = undefined;
  h.game.start();
  await settle(h);
  h.game.clickedToContinue();
  await settle(h);
  return h;
}

function shownOn(h: UIHarness, k: Kind, id: string): boolean {
  const ui: any = h.game.module.ui;
  const all: string[] = ui.findIds(k.tag);
  let shown = false;
  for (const m of flattenMessages(h.messages) as any[]) {
    if (m?.method === k.method && m.params?.target === k.tag && (m.params.elements ?? all).includes(id)) {
      shown = (m.params.instructions ?? []).length > 0;
    }
  }
  return shown;
}

const actionText = (h: UIHarness, from: number) =>
  (flattenMessages(h.messages.slice(from)) as any[])
    .filter((m) => m?.method === "ui/write-text" && m.params?.target === "action")
    .map((m) => (m.params.instructions ?? []).map((e: any) => e.text ?? "").join(""))
    .join("");

const LOADS = [
  [
    "a save resumed",
    (game: any, saved: { save: string; checkpoint: string }) => expect(game.loadToResume(saved.save)).toBe(true),
    true,
  ],
  ["a checkpoint previewed", (game: any, saved: { save: string; checkpoint: string }) => game.load(saved.checkpoint), false],
] as const;

describe("state written before a layout edit (I-2732)", () => {
  describe.each(Object.entries(KINDS))("%s", (_, k) => {
    describe.each(LOADS)("%s", (__, load, resumes) => {
      test.each(EDITS)("%s: an old key names no other element, and the restore keeps only the unmarked element's content", async (edit, after, roles) => {
        const original = await playToSecondLine(PREFIX + BEFORE(k) + k.scene);
        const saved = { save: original.game.saveHere()!.data, checkpoint: original.game.save() };
        const field = JSON.parse(saved.save).modules.ui[k.saved];
        const oldKeys = (Array.isArray(field) ? (field as string[]) : Object.keys(field ?? {})).filter(
          (key) => inLayout(key, "textbox") && key.endsWith("/0/0"),
        );
        expect(oldKeys).toHaveLength(1);

        const source = after(k);
        const h = createHarness(PREFIX + source + k.scene, 0, { beforeConnect: (game) => load(game, saved) });
        await h.ready;
        expect(h.errors).toEqual([]);
        const ui: any = h.game.module.ui;
        const root = source.includes("layout box") ? "box" : "textbox";
        const every: any[] = ui.textElements(k.tag);
        const elements = every.filter((el) => inLayout(ui.elementPath(el), root));
        expect(elements).toHaveLength(roles.length);
        const ids: string[] = elements.map((el) => el.id);
        const named = every.filter((el) => oldKeys.includes(ui.elementPath(el)));
        expect(named).toEqual(edit === "nothing edited" ? [elements[roles.indexOf("marked")]] : []);
        roles.forEach((role, i) => {
          expect(shownOn(h, k, ids[i]!), `${role} element ${i}`).toBe(role === "kept");
        });
        if (resumes) {
          const connected = h.messages.length;
          h.game.context.system.previewing = undefined;
          h.game.start();
          await settle(h);
          expect(actionText(h, connected)).toContain("First line.");
          roles.forEach((role, i) => {
            expect(shownOn(h, k, ids[i]!), `${role} element ${i} after the save resumes`).toBe(role === "kept");
          });
        }
      });
    });
  });
});

describe("two element structures whose fingerprints agree in their first 32 bits (I-2732)", () => {
  const pair = (classes: string, children: string) => `
layout textbox {
  textbox.${classes} {
${children}
    action #clear { text }
  }
}
`;
  const before = pair("probe_14017", "    title #clear { text }\n    title { text }");
  const after = pair("probe_100937", "    title { text }\n    title #clear { text }");

  test("have different key roots, so the reordered layout's unmarked title keeps its content", async () => {
    const k = KINDS.text;
    const original = await playToSecondLine(PREFIX + before + k.scene);
    const checkpoint = original.game.save();
    const h = createHarness(PREFIX + after + k.scene, 0, { beforeConnect: (game) => game.load(checkpoint) });
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    const roots = [(original.game.module.ui as any)._roots.get("layout:textbox"), ui._roots.get("layout:textbox")];
    expect(roots[0]).not.toBe(roots[1]);
    const [kept, marked] = (ui.textElements(k.tag) as any[]).filter((el) => inLayout(ui.elementPath(el), "textbox"));
    expect(shownOn(h, k, kept.id)).toBe(true);
    expect(shownOn(h, k, marked.id)).toBe(false);
  });
});

describe("a program update during a game (I-2732)", () => {
  const k = KINDS.text;
  const titles = (h: UIHarness) => {
    const ui: any = h.game.module.ui;
    return (ui.textElements(k.tag) as any[]).filter((el) => inLayout(ui.elementPath(el), "textbox"));
  };

  test("an update that leaves the layout as it was keeps the mounted elements' marks and content slots", async () => {
    const h = await playToSecondLine(PREFIX + BEFORE(k) + k.scene);
    const ui: any = h.game.module.ui;
    const [marked, kept] = titles(h);
    const before = {
      marked: ui.clearReach(k.tag, "marked"),
      unmarked: ui.clearReach(k.tag, "unmarked"),
      transient: ui.getTransientTargets(),
      slots: [...ui._contentSlots],
    };
    expect(before.marked).toContain(marked);
    expect(before.unmarked).toContain(kept);
    const { program, errors } = compileUI(PREFIX + BEFORE(k) + k.scene);
    expect(errors).toEqual([]);
    h.game.updateProgram(program as never);
    expect(titles(h)).toEqual([marked, kept]);
    expect({
      marked: ui.clearReach(k.tag, "marked"),
      unmarked: ui.clearReach(k.tag, "unmarked"),
      transient: ui.getTransientTargets(),
      slots: [...ui._contentSlots],
    }).toEqual(before);
  });

  test("an update that edits the layout takes effect at the reconnect that follows it", async () => {
    const h = await playToSecondLine(PREFIX + BEFORE(k) + k.scene);
    const reordered = EDITS.find(([edit]) => edit === "the two reordered")![1](k);
    const { program, errors } = compileUI(PREFIX + reordered + k.scene);
    expect(errors).toEqual([]);
    h.game.updateProgram(program as never);
    await h.reconnect();
    await settle(h);
    const [kept, marked] = titles(h);
    expect(shownOn(h, k, kept.id)).toBe(true);
    expect(shownOn(h, k, marked.id)).toBe(false);
    const ui: any = h.game.module.ui;
    expect(ui.elementPath(marked)).not.toBe(Object.keys(ui.state.textCleared).find((key) => key.endsWith("/0/0")));
  });
});

describe("where an element's #clear identity comes from (I-2732)", () => {
  test("a program without layout syntax trees mounts its layouts with no #clear identity and no marks", async () => {
    const h = createHarness(PREFIX + BEFORE(KINDS.text) + KINDS.text.scene, 0, { staticFallback: true });
    await h.ready;
    const ui: any = h.game.module.ui;
    const elements: any[] = ui.textElements("title");
    expect(elements.length).toBeGreaterThan(0);
    expect(elements.map((el) => ui.elementPath(el))).toEqual(elements.map(() => undefined));
    expect(ui.getTransientTargets()).toEqual([]);
  });

  test.each([
    ["closure", "#clear={shown}"],
    ["interpolation", '#clear="{shown}"'],
  ])("a #clear given a bound value (%s) is refused with an error naming the literal spellings", (_kind, prop) => {
    const source = PREFIX + layout("textbox", `    title ${prop} { text }`) + KINDS.text.scene;
    const { program, errors } = compileUI(source);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("`#clear` takes no bound value");
    expect(errors[0]).toContain("`#clear=true` or `#clear=false`");
    const diagnostic = Object.values((program as any).diagnostics)
      .flat()
      .find((d: any) => (d.message?.value ?? d.message) === errors[0]) as any;
    const lines = source.split("\n");
    const line = lines.findIndex((l) => l.includes(prop));
    const { start, end } = diagnostic.range;
    expect(start.line).toBe(line);
    expect(end.line).toBe(line);
    expect(lines[line]?.slice(start.character, end.character)).toBe(prop);
  });

  test.each(["#clear", "#clear=true", "#clear=false"])("a literal %s compiles without a diagnostic", (prop) => {
    const source = PREFIX + layout("textbox", `    title ${prop} { text }`) + KINDS.text.scene;
    expect(compileUI(source).errors).toEqual([]);
  });

  test("a #clear given a bound value is unmarked whatever the value", async () => {
    const source = PREFIX + layout("textbox", "    title #clear={shown} { text }") + KINDS.text.scene;
    const { program } = compileUI(source);
    const title = (program as any).sparkle.layouts.textbox.children[0].children[0];
    expect(title.props.clear.kind).toBe("binding");
    const h = await playToSecondLine(source, 1);
    const ui: any = h.game.module.ui;
    expect(ui.getTransientTargets()).not.toContain("title");
    const [el] = (ui.textElements("title") as any[]).filter((e) => inLayout(ui.elementPath(e), "textbox"));
    expect(shownOn(h, KINDS.text, el.id)).toBe(true);
  });
});
