import { describe, expect, test, vi } from "vitest";
import { Coordinator } from "../../src/game/core/classes/Coordinator";
import { TEXT_REASONS, type TextClearReason, type TextReason } from "../../src/game/modules/ui/types/TextReason";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

type Rule = {
  deletesSavedText: boolean;
  recordsStamp: boolean;
  opensLine: boolean;
  reach: "marked" | "unmarked" | "name";
};

const EXPECTED_RULES: Record<TextReason, Rule> = {
  "line write": { deletesSavedText: false, recordsStamp: true, opensLine: false, reach: "name" },
  "line clear": { deletesSavedText: true, recordsStamp: true, opensLine: true, reach: "marked" },
  "line replace": { deletesSavedText: true, recordsStamp: false, opensLine: false, reach: "name" },
  choose: { deletesSavedText: true, recordsStamp: false, opensLine: false, reach: "name" },
  "leave choices": { deletesSavedText: true, recordsStamp: false, opensLine: false, reach: "name" },
  "rollback cleanup": { deletesSavedText: false, recordsStamp: false, opensLine: false, reach: "name" },
  "connect reset": { deletesSavedText: true, recordsStamp: true, opensLine: true, reach: "marked" },
  "unwritten slot": { deletesSavedText: false, recordsStamp: false, opensLine: false, reach: "unmarked" },
  redisplay: { deletesSavedText: true, recordsStamp: true, opensLine: false, reach: "marked" },
};

const REASON_SOURCE = `
layout textbox {
  textbox {
    note #clear { text }
    other { text "Label" }
    tag #clear { text }
  }
}

layout banner {
  banner { tag { text } }
}

scene start
  Hello.
end
`;

const savedText = (ui: any, target: string) =>
  ui.state.text?.[target]?.map((s: any) => s.text).join("");

type Call = { reason?: string; target: string; ids: string[]; sequence: unknown };

const recordCalls = (game: any, calls: Call[]) => {
  const text: any = game.module.ui.text;
  let reason: string | undefined;
  const writeElements = text.writeElements.bind(text);
  vi.spyOn(text, "writeElements").mockImplementation(((target: string, els: any[], sequence: unknown, ...rest: unknown[]) => {
    calls.push({ reason, target, ids: els.map((el) => el.id), sequence });
    return writeElements(target, els, sequence, ...rest);
  }) as never);
  const change = text.change.bind(text);
  vi.spyOn(text, "change").mockImplementation(((...args: unknown[]) => {
    reason = args[0] as string;
    try {
      return change(...args);
    } finally {
      reason = undefined;
    }
  }) as never);
};

describe("every text write and clear names its reason (I-2732)", () => {
  test("the reason table is the one this test states", () => {
    expect(TEXT_REASONS).toEqual(EXPECTED_RULES);
  });

  test.each(Object.entries(EXPECTED_RULES) as [TextReason, Rule][])(
    "%s does what its row states for saved text, its stamp, a new line and its reach",
    async (reason, rule) => {
      const calls: Call[] = [];
      const h = createHarness(REASON_SOURCE, 0, { beforeConnect: (game) => recordCalls(game, calls) });
      await h.ready;
      expect(h.errors).toEqual([]);
      const ui: any = h.game.module.ui;
      await ui.text.change("line clear", []);
      await ui.text.change("line write", "note", [{ text: "Before." }], true);
      await ui.text.change("line write", "other", [{ text: "Kept." }], true);
      expect(savedText(ui, "note")).toBe("Before.");
      const notePath = ui.elementPath(ui.textElements("note")[0]);
      const clearedBefore = ui.state.textCleared?.[notePath];
      const earlier = () => ui.state.textWritten.other;
      const [markedTag, unmarkedTag] = ui.textElements("tag").map((el: any) => el.id);
      expect(ui.elementPath(ui.textElements("tag")[0])).toMatch(/^layout:textbox@[0-9a-f]{8}\/0\/2$/);
      const reached = {
        marked: [markedTag],
        unmarked: [unmarkedTag],
        name: [markedTag, unmarkedTag],
      }[rule.reach];
      if (reason === "line write") {
        delete ui.state.textWritten.note;
        await ui.text.change(reason, "note", [{ text: "After." }], true);
        expect(savedText(ui, "note")).toBe("Before.After.");
        expect(ui.state.textWritten?.note !== undefined, "stamp").toBe(rule.recordsStamp);
        expect(ui.state.textWritten.note > earlier(), "new line").toBe(rule.opensLine);
        calls.length = 0;
        await ui.text.change(reason, "tag", [{ text: "Tagged." }], true);
        expect(calls.filter((c) => c.target === "tag").flatMap((c) => c.ids)).toEqual(reached);
      } else {
        await ui.text.change(reason as TextClearReason, ["note"]);
        expect(savedText(ui, "note") === undefined, "saved text deleted").toBe(rule.deletesSavedText);
        expect(ui.state.textCleared?.[notePath] !== clearedBefore, "stamp").toBe(rule.recordsStamp);
        if (rule.recordsStamp) {
          expect(ui.state.textCleared[notePath]).toBe(ui.state.textLine);
          expect(ui.state.textCleared[notePath] > earlier(), "new line").toBe(rule.opensLine);
        } else {
          expect(ui.state.textLine === earlier(), "new line").toBe(!rule.opensLine);
        }
        calls.length = 0;
        await ui.text.change(reason as TextClearReason, ["tag"]);
        expect(calls.filter((c) => c.target === "tag").flatMap((c) => c.ids)).toEqual(reached);
      }
      expect(savedText(ui, "other")).toBe("Kept.");
    },
  );

  test("nothing on the text module but its change entry can record a line stamp", async () => {
    const h = createHarness(REASON_SOURCE);
    await h.ready;
    const ui: any = h.game.module.ui;
    for (const name of ["write", "clear", "clearAll", "clearRendered", "saveState"]) {
      expect(name in ui.text, `text.${name}`).toBe(false);
    }
    for (const name of ["beginTextLine", "markTextLine", "textLineStamps"]) {
      expect(name in ui, name).toBe(false);
    }
    await ui.text.change("line clear", []);
    await ui.text.change("line write", "other", [{ text: "Before." }], true);
    const stamps = () => JSON.stringify([ui.state.textLine, ui.state.textWritten, ui.state.textCleared]);
    const before = stamps();
    const surface = new Set<string>();
    for (let proto = Object.getPrototypeOf(ui.text); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name !== "constructor" && name !== "change" && typeof ui.text[name] === "function") {
          surface.add(name);
        }
      }
    }
    expect(surface.size).toBeGreaterThan(0);
    for (const name of surface) {
      for (const args of [["other"], ["other", [{ text: "x" }], true], ["other", ui.textElements("other"), null, true]]) {
        try {
          await ui.text[name](...args);
        } catch {}
        await flushMicrotasks(5);
        expect(stamps(), `text.${name}`).toBe(before);
      }
    }
  });
});

type Kind = {
  kind: string;
  element: string;
  layout: (clear: string) => string;
  names: string[];
  slot: string;
  stream?: boolean;
  scene?: string;
};

const KINDS: Kind[] = [
  {
    kind: "an exact name",
    element: "action",
    layout: (c) => `layout textbox {\n  textbox { action${c} { text } }\n}\n`,
    names: ["action"],
    slot: "action",
  },
  {
    kind: "an alias",
    element: "dialogue.action",
    layout: (c) => `layout textbox {\n  textbox { dialogue.action${c} { text } }\n}\n`,
    names: ["action", "dialogue"],
    slot: "dialogue action",
  },
  {
    kind: "a multi-name slot",
    element: "title.action",
    layout: (c) => `layout textbox {\n  textbox { title.action${c} { text } }\n}\n`,
    names: ["title action", "action"],
    slot: "title action",
  },
  {
    kind: "an element inside a stream",
    element: "dialogue",
    layout: (c) =>
      `layout textbox {\n  textbox { dialogue${c} { text } }\n}\n\nlayout log {\n  stream { dialogue.bubble${c} { text } }\n}\n`,
    names: ["dialogue"],
    slot: "dialogue",
    stream: true,
    scene: "  [[open log]]\n  HERO: Hello.\n",
  },
];

const scene = (kind: Kind) => `
define HERO as character with
  name = "HERO"
end

scene start
${kind.scene ?? "  HERO: Hello.\n"}end
`;

const extraLayout = (kind: Kind) => `\nlayout extra {\n  extra { ${kind.element} { text } }\n}\n`;

type Ids = { marked: string[]; unmarked: string[]; all: string[] };

type Site = {
  site: string;
  clear: boolean;
  selected: (h: ReturnType<typeof createHarness>, kind: Kind, calls: Call[]) => Promise<string[][]>;
  expected: (ids: Ids) => string[];
};

const SITES: Site[] = [
  {
    site: "initLayout's #clear targets",
    clear: true,
    selected: async (h, kind) => {
      const ui: any = h.game.module.ui;
      const touched = new Set(ui.findElements(kind.slot).map((el: any) => el.id));
      if (kind.stream) {
        expect(ui.getTransientTargets()).not.toContain("dialogue bubble");
      }
      return ui
        .getTransientTargets()
        .map((t: string) => ui.clearReach(t, "marked").map((el: any) => el.id))
        .filter((ids: string[]) => ids.some((id) => touched.has(id)));
    },
    expected: (ids) => ids.marked,
  },
  {
    site: "connect's reset",
    clear: true,
    selected: async (_h, kind, calls) =>
      calls
        .filter((c) => c.reason === "connect reset" && c.target === kind.slot && c.ids.length > 0)
        .map((c) => c.ids),
    expected: (ids) => ids.marked,
  },
  {
    site: "connect's empty-slot reset",
    clear: false,
    selected: async (_h, kind, calls) =>
      calls
        .filter((c) => c.reason === "unwritten slot" && c.target === kind.slot && c.ids.length > 0)
        .map((c) => c.ids),
    expected: (ids) => ids.unmarked,
  },
  {
    site: "a line clear",
    clear: true,
    selected: async (h, kind, calls) => {
      calls.length = 0;
      await (h.game.module.ui as any).text.change("line clear", [kind.slot]);
      return calls.filter((c) => c.sequence === null && c.ids.length > 0).map((c) => c.ids);
    },
    expected: (ids) => ids.marked,
  },
  {
    site: "restoreTexts",
    clear: false,
    selected: async (h, kind, calls) => {
      const ui: any = h.game.module.ui;
      await ui.text.change("line clear", []);
      for (const name of kind.names) {
        await ui.text.change("line write", name, [{ text: name }], true);
      }
      calls.length = 0;
      await ui.onRestore();
      await flushMicrotasks(20);
      return calls.filter((c) => kind.names.includes(c.target) && c.sequence !== null).map((c) => c.ids);
    },
    expected: (ids) => ids.all,
  },
];

describe("every site picks text targets' elements through one resolver (I-2732)", () => {
  test.each(
    KINDS.flatMap((kind) =>
      SITES.flatMap((site) =>
        [false, true].map((mixed) => [site.site, kind.kind, mixed ? " beside an unmarked one" : "", site, kind, mixed] as const),
      ),
    ),
  )("%s selects through the resolver for %s%s", async (_, __, ___, site, kind, mixed) => {
    const calls: Call[] = [];
    const source =
      kind.layout(site.clear ? " #clear" : "") + (mixed && !kind.stream ? extraLayout(kind) : "") + scene(kind);
    const h = createHarness(source, 0, { beforeConnect: (game) => recordCalls(game, calls) });
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    if (kind.stream) {
      h.jumpToFlow("start");
      for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
        new Coordinator(h.game, beat);
        await flushMicrotasks(20);
      }
    }
    const all: string[] = ui.textElements(kind.slot).map((el: any) => el.id);
    expect(all).toHaveLength(mixed && !kind.stream ? 2 : 1);
    for (const name of kind.names) {
      expect(ui.textElements(name).map((el: any) => el.id), name).toEqual(all);
    }
    const marked: string[] = ui.clearReach(kind.slot, "marked").map((el: any) => el.id);
    const unmarked = all.filter((id) => !marked.includes(id));
    expect(marked).toHaveLength(site.clear ? 1 : 0);
    const ids: Ids = { marked, unmarked, all };
    const inside: string[] = kind.stream ? ui.findElements("bubble").map((el: any) => el.id) : [];
    if (kind.stream && (site.site === "a line clear" || site.site === "restoreTexts")) {
      expect(inside.length, "a stream entry exists").toBeGreaterThan(0);
    }
    const selections = await site.selected(h, kind, calls);
    const expected = site.expected(ids);
    if (expected.length === 0) {
      expect(selections.flat()).toEqual([]);
    } else {
      expect(selections.length, "the site selected something").toBeGreaterThan(0);
      for (const selection of selections) {
        expect(selection).toEqual(expected);
      }
    }
    for (const selection of selections) {
      for (const id of inside) {
        expect(selection).not.toContain(id);
      }
    }
  });
});
