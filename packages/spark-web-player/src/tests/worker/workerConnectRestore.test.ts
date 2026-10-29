import { describe, expect, it } from "vitest";
import { StartPlayMessage } from "../../main/workers/messages/StartPlayMessage";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

type Node = { class?: string; text?: string; children?: Node[] };

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

const TEXT = script("dialogue");

const SHARED = script("dialogue.action");

const lineOf = (text: string, needle: string) =>
  text.split("\n").findIndex((l) => l.includes(needle));

type Harness = Awaited<ReturnType<typeof createPlayerHarness>>;

const open = async (text: string, line: number) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text }],
    startFrom: { file: MAIN_URI, line },
  });
  await h.compile();
  await h.select(line);
  return h;
};

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
      expect(saysIn(h.snapshotDOM() as Node, "dialogue")).toBe(false);
      await editWord(h, TEXT, line);
      const dom = h.snapshotDOM() as Node;
      expect(lettersIn(dom, "dialogue")).toBe("Premier.Second.");
      expect(lettersIn(dom, "dialogue")).toBe(
        await freshLetters(edited(TEXT), line, "dialogue"),
      );
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
      const shown = () => lettersIn(h.snapshotDOM() as Node, "dialogue");
      for (let i = 0; i < 150 && shown() !== "First."; i++) {
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

  it("sweeps the preview's text once PLAY has connected, before its first beat (#1222)", async () => {
    const line = lineOf(TEXT, "HERO:");
    const h = await open(TEXT, line);
    try {
      expect(lettersIn(h.snapshotDOM() as Node, "dialogue")).toBe("First.Second.");
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const request = h.link.request.bind(h.link);
      (h.link as any).request = async (type: any, params: any) => {
        if (type.method === StartPlayMessage.method) {
          await held;
        }
        return request(type, params);
      };
      const played = h.controller.startGameAndApp();
      await settle(60);
      const dom = h.snapshotDOM() as Node;
      expect(lettersIn(dom, "dialogue")).toBe("");
      expect(saysIn(dom, "dialogue")).toBe(true);
      release();
      expect(await played).toBe(true);
      await h.controller.destroyGameAndApp();
    } finally {
      h.dispose();
    }
  }, 120_000);
});
