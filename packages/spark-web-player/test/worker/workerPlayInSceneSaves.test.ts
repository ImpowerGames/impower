import { describe, expect, it } from "vitest";
import type { PreviewSave } from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `store trust = 0
store suspect = "Ana"

scene start
  -> interrogation("nine")
end

scene interrogation(hour)
  if count.visits(-> interrogation) > 1 then
    INSPECTOR:
      Back again, {suspect}?
  end
  INSPECTOR:
    Where were you at {hour}?
  choose
    * [Tell the truth.]
      trust += 2
    * [Lie.]
      trust -= 1
  end
  if trust > 3 then
    INSPECTOR:
      I believe you.
  end
  INSPECTOR:
    Now tell me about the night.
  choose
    * [Talk.]
      INSPECTOR:
        Go on.
  end
end
`;

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));

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
      case "preview/deleteSaves":
        for (const id of params.ids) {
          const at = saves.findIndex((save) => save.id === id);
          if (at >= 0) saves.splice(at, 1);
        }
        return {};
      default:
        return {};
    }
  };
  return saves;
};

describe("PLAY from a line inside a scene other than start", () => {
  it.each([
    ["a line inside a block", "I believe you."],
    ["a line at the scene's top level", "Where were you at"],
  ])(
    "from %s, writes Entering interrogation and saves here at that line",
    async (_label, text) => {
      const line = lineOf(text);
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line },
        manualClock: true,
      });
      const win = h.overlay.ownerDocument.defaultView as any;
      win.requestAnimationFrame ??= (callback: () => void) =>
        setTimeout(callback, 0);
      const saves = fakeHost(h);
      try {
        await h.compile();
        await h.select(line);
        await settle(40);
        expect(await h.controller.startGameAndApp()).toBe(true);
        await settle(40);

        expect(saves.map((save) => [save.kind, save.name])).toEqual([
          ["lastRun", "Entering interrogation"],
        ]);

        await h.controller._saves.saveHere();
        const saved = saves.find((save) => save.kind === "saved");
        expect(saved?.name).toBe(`interrogation, line ${line + 1}`);
      } finally {
        await h.controller.stopGame("quit");
        await settle(20);
        h.dispose();
      }
    },
    120_000,
  );
});
