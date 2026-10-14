// A connect that rebuilds the Game Preview's screen restores the text each
// target has saved in place of what the page shows (#1813): a target with
// text of its own, which the connect does not clear, reads as the restored
// text alone, as a player opened fresh on the same source does, and not as
// the text it showed with the restored text after it. Two targets that name
// one element both restore onto it. The layout's own text in a written
// target (`Says:`) is a placeholder, the maintainer's rule: shown until the
// first write reaches the target, and gone after it.
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

type Node = { class?: string; text?: string; children?: Node[] };

/** The text of every letter span under the elements whose class list holds
 *  `cls`, in document order. */
const lettersIn = (root: Node, cls: string): string => {
  let out = "";
  const walk = (n: Node, inside: boolean) => {
    const classes = (n.class ?? "").split(/\s+/);
    const now = inside || classes.includes(cls);
    if (now && classes.includes("text_letter")) {
      out += n.text ?? "";
    }
    for (const c of n.children ?? []) {
      walk(c, now);
    }
  };
  walk(root, false);
  return out;
};

/** Whether the layout's own `Says:` is still in the element whose class list
 *  holds `cls`. */
const saysIn = (root: Node, cls: string): boolean => {
  let found = false;
  const walk = (n: Node, inside: boolean) => {
    const now = inside || (n.class ?? "").split(/\s+/).includes(cls);
    if (now && n.text === "Says:") {
      found = true;
    }
    for (const c of n.children ?? []) {
      walk(c, now);
    }
  };
  walk(root, false);
  return found;
};

const script = (box: string) =>
  [
    `store word = "First."`,
    "",
    "function set_word(v)",
    "  word = v",
    `  return ""`,
    "end",
    "",
    "layout main with",
    "  textbox {",
    `    ${box} {`,
    `      text "Says:"`,
    "    }",
    "  }",
    "end",
    "",
    "-> start",
    "",
    "scene start",
    "  Before.",
    `  HERO: {set_word("First.")}{word} > Second.`,
    "end",
  ].join("\n");

/** The ticket's fixture: a dialogue box with text of its own, so it is not
 *  cleared on continue. */
const TEXT = script("dialogue");

/** The same box named by both the action and the dialogue targets. */
const SHARED = script("dialogue.action");

const lineOf = (text: string, needle: string) =>
  text.split("\n").findIndex((l) => l.includes(needle));

type Harness = Awaited<ReturnType<typeof createPlayerHarness>>;

/** A harness on `text`, previewing `line` once compiled. */
const open = async (text: string, line: number) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text }],
    startFrom: { file: MAIN_URI, line },
  });
  await h.compile();
  await h.select(line);
  return h;
};

/** Edits `First.` in the selected line's `set_word("First.")` to `Premier.`
 *  and compiles, as an incremental edit that connects the worker's game in
 *  full. */
const editWord = async (h: Harness, text: string, line: number) => {
  const start = text.split("\n")[line]!.indexOf(`"First."`) + 1;
  await h.edit([
    {
      range: {
        start: { line, character: start },
        end: { line, character: start + "First.".length },
      },
      text: "Premier.",
    },
  ]);
  await h.compile();
};

const edited = (text: string) =>
  text.replace(`set_word("First.")`, `set_word("Premier.")`);

/** What a player opened fresh on `text` at `line` shows in `cls`. */
const freshLetters = async (text: string, line: number, cls: string) => {
  const h = await open(text, line);
  try {
    return lettersIn(h.snapshotDOM() as Node, cls);
  } finally {
    h.dispose();
  }
};

describe("a connect restores each target's text in place of what it shows (#1813)", () => {
  it("shows a standing dialogue box's restored text alone after an edit", async () => {
    const line = lineOf(TEXT, "HERO:");
    const h = await open(TEXT, line);
    try {
      expect(lettersIn(h.snapshotDOM() as Node, "dialogue")).toBe("First.Second.");
      // The first write replaced the layout's placeholder.
      expect(saysIn(h.snapshotDOM() as Node, "dialogue")).toBe(false);
      await editWord(h, TEXT, line);
      const dom = h.snapshotDOM() as Node;
      expect(lettersIn(dom, "dialogue")).toBe("Premier.Second.");
      expect(lettersIn(dom, "dialogue")).toBe(
        await freshLetters(edited(TEXT), line, "dialogue"),
      );
      // The connect's creates put the placeholder back; the restore replaced it.
      expect(saysIn(dom, "dialogue")).toBe(false);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("restores both targets that name one element onto it", async () => {
    const line = lineOf(SHARED, "HERO:");
    const h = await open(SHARED, line);
    try {
      expect(lettersIn(h.snapshotDOM() as Node, "dialogue")).toBe("Before.First.Second.");
      await editWord(h, SHARED, line);
      const dom = h.snapshotDOM() as Node;
      expect(lettersIn(dom, "dialogue")).toBe("Before.Premier.Second.");
      expect(lettersIn(dom, "dialogue")).toBe(
        await freshLetters(edited(SHARED), line, "dialogue"),
      );
      expect(saysIn(dom, "dialogue")).toBe(false);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("shows a standing target the restored state does not write as its placeholder alone, as a fresh page does", async () => {
    const h = await open(TEXT, lineOf(TEXT, "HERO:"));
    try {
      expect(lettersIn(h.snapshotDOM() as Node, "dialogue")).toBe("First.Second.");
      // The line before has written nothing to the dialogue box.
      await h.select(lineOf(TEXT, "Before."));
      const dom = h.snapshotDOM() as Node;
      expect(lettersIn(dom, "dialogue")).toBe("");
      expect(saysIn(dom, "dialogue")).toBe(true);
    } finally {
      h.dispose();
    }
    const fresh = await open(TEXT, lineOf(TEXT, "Before."));
    try {
      expect(lettersIn(fresh.snapshotDOM() as Node, "dialogue")).toBe("");
      expect(saysIn(fresh.snapshotDOM() as Node, "dialogue")).toBe(true);
    } finally {
      fresh.dispose();
    }
  }, 120_000);

  it("starts PLAY over a displayed preview without keeping the preview's text", async () => {
    const line = lineOf(TEXT, "HERO:");
    const h = await open(TEXT, line);
    try {
      expect(lettersIn(h.snapshotDOM() as Node, "dialogue")).toBe("First.Second.");
      expect(await h.controller.startGameAndApp()).toBe(true);
      // PLAY's connect is not composed; its first beat is the line's first.
      const shown = () => lettersIn(h.snapshotDOM() as Node, "dialogue");
      for (let i = 0; i < 150 && shown() === "First.Second."; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await settle();
      }
      expect(shown()).toBe("First.");
      expect(saysIn(h.snapshotDOM() as Node, "dialogue")).toBe(false);
      await h.controller.destroyGameAndApp();
    } finally {
      h.dispose();
    }
  }, 120_000);
});
