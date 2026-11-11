import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `-> start

scene start
  HERO:
    The first line.

  HERO:
    The second line.

  HERO:
    The third line.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const SECOND = lineOf("The second line.");
const THIRD = lineOf("The third line.");

const replace = (line: number, from: string, to: string) => [
  {
    range: {
      start: { line, character: 4 },
      end: { line, character: 4 + from.length },
    },
    text: to,
  },
];

const writesOf = (messages: any[], words: string): boolean[] => {
  const atOnce: boolean[] = [];
  const visit = (message: any) => {
    if (message?.method === "ui/beat") {
      for (const op of message.params?.messages ?? []) visit(op);
      return;
    }
    if (message?.method !== "ui/write-text") return;
    const text = (message.params?.instructions ?? [])
      .map((i: any) => i.text ?? "")
      .join("");
    if (text.includes(words)) {
      const { instant, shown, instructions } = message.params;
      atOnce.push(
        Boolean(instant) ||
          (shown ?? 0) >= instructions.length ||
          instructions.every((i: any) => (i.after ?? 0) === 0 && (i.over ?? 0) === 0),
      );
    }
  };
  for (const message of messages) visit(message);
  return atOnce;
};

const imagesOf = (messages: any[]): string[] => {
  const images: string[] = [];
  const visit = (message: any) => {
    if (message?.method === "ui/beat") {
      for (const op of message.params?.messages ?? []) visit(op);
      return;
    }
    if (message?.method === "ui/write-image") images.push(message.params.target);
  };
  for (const message of messages) visit(message);
  return images;
};

const PORTRAIT = `define a as image with
  src = "https://example.com/a.png"
end

scene start
  HERO:
    [[a]]
    The second line.

  HERO:
    The third line.
end
`;

const restarts = async (h: { toEditor: any[] }, before: number) => {
  for (let i = 0; i < 200; i++) {
    const reloads = h.toEditor.filter((m) => m.method === "game/reloaded").length;
    if (reloads > before) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("The game never restarted");
};

const playing = async (source = SOURCE) => {
  const second = source.split("\n").findIndex((l) => l.includes("The second line."));
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: source }],
    startFrom: { file: MAIN_URI, line: second },
    manualClock: true,
  });
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  await h.compile();
  await h.select(second);
  await settle(40);
  const from = h.toRouter.length;
  expect(await h.controller.startGameAndApp()).toBe(true);
  await settle(40);
  await h.tick(1000 / 60, 120);
  const played = writesOf(h.toRouter.slice(from), "The second line.");
  const editAndRestart = async (line: number, from: string, to: string, frames = 120) => {
    const reloads = h.toEditor.filter((m) => m.method === "game/reloaded").length;
    const at = h.toRouter.length;
    await h.edit(replace(line, from, to));
    await h.compile();
    await restarts(h, reloads);
    await settle(40);
    await h.tick(1000 / 60, frames);
    return h.toRouter.slice(at);
  };
  const editWords = async (from: string, to: string, frames = 120) => {
    const lines = source.split("\n");
    const line = lines.findIndex((l) => l.includes(from));
    const character = lines[line]!.indexOf(from);
    const reloads = h.toEditor.filter((m) => m.method === "game/reloaded").length;
    const at = h.toRouter.length;
    await h.edit([
      {
        range: {
          start: { line, character },
          end: { line, character: character + from.length },
        },
        text: to,
      },
    ]);
    await h.compile();
    await restarts(h, reloads);
    await settle(40);
    await h.tick(1000 / 60, frames);
    return h.toRouter.slice(at);
  };
  return { h, played, editAndRestart, editWords };
};

describe("a line PLAY redelivers after an edit restarts the run (#2031)", () => {
  it("types the line PLAY starts on", async () => {
    const { h, played } = await playing();
    try {
      expect(played).toEqual([false]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("shows the line on screen at once when an edit elsewhere leaves it unchanged", async () => {
    const { h, editAndRestart } = await playing();
    try {
      const after = await editAndRestart(THIRD, "The third line.", "The third line, edited.");
      expect(writesOf(after, "The second line.")).toEqual([true]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("types the line on screen when the edit changed its text", async () => {
    const { h, editAndRestart } = await playing();
    try {
      const after = await editAndRestart(SECOND, "The second line.", "The second line, edited.");
      expect(writesOf(after, "The second line, edited.")).toEqual([false]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("types the line again when the author restarts the run", async () => {
    const { h } = await playing();
    try {
      const at = h.toRouter.length;
      await h.controller.handleRestartGame({ id: 1 });
      await settle(40);
      await h.tick(1000 / 60, 120);
      expect(writesOf(h.toRouter.slice(at), "The second line.")).toEqual([false]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("shows an unchanged line with a portrait at once and draws the portrait again", async () => {
    const { h, editAndRestart } = await playing(PORTRAIT);
    try {
      const third = PORTRAIT.split("\n").findIndex((l) => l.includes("The third line."));
      const after = await editAndRestart(third, "The third line.", "The third line, edited.");
      expect(writesOf(after, "The second line.")).toEqual([true]);
      expect(imagesOf(after)).toContain("portrait");
    } finally {
      h.dispose();
    }
  }, 120_000);
});

const LONG = `-> start

scene start
  HERO:
    The first line.

  HERO:
    The second line. It has enough words to take a long time to type.

  HERO:
    The third line.
end
`;

describe("a redelivered line behaves as a line already read (#2031)", () => {
  it("advances on the first tap once it is shown", async () => {
    const { h, editWords } = await playing(LONG);
    try {
      expect(writesOf(await editWords("The third line.", "The third line, edited.", 15), "The second line.")).toEqual([true]);
      const at = h.toRouter.length;
      h.controller._app.emit(EventMessage.type.notification({ type: "pointerdown", button: 0 } as never));
      await settle(20);
      await h.tick(1000 / 60, 15);
      expect(writesOf(h.toRouter.slice(at), "The third line, edited.")).toHaveLength(1);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("shows the line at once when only the typewriter's pace was edited", async () => {
    const { h, editWords } = await playing(
      `define dialogue as typewriter with\n  letter_pause = 0.025\nend\n\n${LONG}`,
    );
    try {
      expect(writesOf(await editWords("letter_pause = 0.025", "letter_pause = 0.05"), "The second line.")).toEqual([true]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("shows the line at once when a zero pace becomes a positive one", async () => {
    const { h, editWords } = await playing(
      `define dialogue as typewriter with\n  letter_pause = 0\nend\n\n${LONG}`,
    );
    try {
      expect(writesOf(await editWords("letter_pause = 0", "letter_pause = 0.05"), "The second line.")).toEqual([true]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("keeps the line before it on a text stream page", async () => {
    const { h, editWords } = await playing(
      `define ui as config with\n  layouts_initial = { "textstream" }\nend\n\n${LONG}`,
    );
    try {
      const entries = () =>
        h.playing()!.module.ui.page.entries
          .filter((e: any) => e.text)
          .map((e: any) => e.text.map((t: any) => t.text).join("").trim());
      const before = entries();
      expect(before).toContain("The first line.");
      expect(writesOf(await editWords("The third line.", "The third line, edited."), "The second line.")).toEqual([true]);
      expect(entries()).toEqual(before);
    } finally {
      h.dispose();
    }
  }, 120_000);
});
