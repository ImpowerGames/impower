import { describe, expect, it } from "vitest";
import type { PreviewSave } from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

type Node = { class?: string; text?: string; children?: Node[] };

const textIn = (root: Node, cls: string): string => {
  let out = "";
  const walk = (n: Node, inside: boolean) => {
    const now = inside || (n.class ?? "").split(/\s+/).includes(cls);
    if (now && n.text && !(n.children ?? []).length) {
      out += n.text;
    }
    for (const c of n.children ?? []) {
      walk(c, now);
    }
  };
  walk(root, false);
  return out;
};

const SOURCE = `style box {
  position = absolute
  left = 24px
  right = 24px
  bottom = 48px
  color = white
  font_size = 28px
  display = flex
  flex_direction = column
}

layout textbox {
  box {
    title { text }
    action #clear { text }
  }
}

scene start
  ^: Chapter One

  First line.

  Second line.

  Third line.

  Fourth line.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));

const fakeHost = (h: any) => {
  const saves: PreviewSave[] = [];
  h.controller.requestHost = async (type: any, params: any) => {
    switch (type.method) {
      case "preview/listSaves":
        return { saves: [...saves] };
      case "preview/writeSave": {
        const at = saves.findIndex((save) => save.id === params.save.id);
        if (at >= 0) saves[at] = params.save;
        else saves.push(params.save);
        return {};
      }
      default:
        return {};
    }
  };
  return { saves };
};

const shownText = (game: any): string =>
  Object.values(game._shownBeatOnScreen?.text ?? {})
    .flat()
    .map((event: any) => event.text ?? "")
    .join("");

describe("an element without #clear keeps an earlier line's text where a preview or a loaded save shows it (I-2732, #2841, #2842)", () => {
  it("a preview of a later line shows the title an earlier line wrote", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("Chapter One") },
    });
    try {
      await h.compile();
      await h.select(lineOf("Chapter One"));
      expect(textIn(h.snapshotDOM() as Node, "title")).toContain("Chapter One");
      await h.select(lineOf("First line."));
      expect(textIn(h.snapshotDOM() as Node, "action")).toContain("First line.");
      expect(textIn(h.snapshotDOM() as Node, "title")).toContain("Chapter One");
      await h.select(lineOf("Second line."));
      expect(textIn(h.snapshotDOM() as Node, "title")).toContain("Chapter One");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("a save played from shows the title an earlier line wrote", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("Chapter One") },
      manualClock: true,
    });
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    const host = fakeHost(h);
    try {
      await h.compile();
      await h.select(lineOf("Chapter One"));
      await settle(40);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(40);
      for (let i = 0; i < 40 && !shownText(h.playing()).includes("Third line."); i++) {
        h.playing()!.clickedToContinue();
        await h.tick(1000 / 60, 2);
      }
      expect(shownText(h.playing())).toContain("Third line.");
      await settle(20);
      await h.controller._saves.saveHere();
      const saved = host.saves.find((save) => save.kind === "saved")!;
      expect(saved).toBeDefined();
      await h.controller.stopGame("quit");
      await settle(40);
      await h.controller.playFromSave(saved.data);
      await settle(40);
      for (let i = 0; i < 20; i++) {
        await h.tick(1000 / 60, 2);
      }
      await settle(20);
      expect(textIn(h.snapshotDOM() as Node, "title")).toContain("Chapter One");
    } finally {
      await h.controller.stopGame("quit");
      await settle(20);
      h.dispose();
    }
  }, 120_000);
});
