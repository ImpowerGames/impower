import { describe, expect, it } from "vitest";
import type { PreviewSave } from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `store trust = 0
store suspect = "Ana"

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
    That will be all.
end

scene start
  HERO:
    Opening.
  -> interrogation("nine")
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));

const fakeHost = (h: any) => {
  const saves: PreviewSave[] = [];
  const calls: [string, any][] = [];
  h.controller.requestHost = async (type: any, params: any) => {
    calls.push([type.method, params]);
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
  return { saves, calls };
};

const shownText = (game: any): string =>
  Object.values(game._shownBeatOnScreen?.text ?? {})
    .flat()
    .map((event: any) => event.text ?? "")
    .join("");

const advanceTo = async (h: any, text: string) => {
  for (let i = 0; i < 40 && !shownText(h.playing()).includes(text); i++) {
    h.playing().clickedToContinue();
    await h.tick(1000 / 60, 2);
  }
  expect(shownText(h.playing())).toContain(text);
};

describe("saves made while playing in the player", () => {
  it("writes Last run saves, saves here and plays on from a save at its line", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("Opening.") },
      manualClock: true,
    });
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    const host = fakeHost(h);
    try {
      await h.compile();
      await h.select(lineOf("Opening."));
      await settle(40);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(40);
      await advanceTo(h, "Where were you at nine?");
      await settle(20);
      expect(host.saves.map((save) => [save.kind, save.name])).toEqual([
        ["lastRun", "Entering start"],
        ["lastRun", "Entering interrogation"],
      ]);
      expect(host.saves[1]!.values.frames.at(-1)!.params).toEqual({ hour: '"nine"' });

      await h.controller._saves.saveHere();
      const saved = host.saves.find((save) => save.kind === "saved")!;
      expect(saved.name).toBe(`interrogation, line ${lineOf("Where were you") + 1}`);
      expect(h.controller._saves.note()).toEqual({
        name: saved.name,
        id: saved.id,
      });

      await h.controller.stopGame("quit");
      await settle(40);

      await h.controller.playFromSave(saved.data);
      await settle(40);
      const running = h.playing()!;
      expect(running).toBeDefined();
      expect(shownText(running)).toContain("Where were you at nine?");
      expect(running.story.state.variablesState["trust"]).toBe(0);

      expect(await h.controller.handleStartGame({ id: 99, params: {} })).toMatchObject({
        result: { success: true },
      });
      await settle(40);
      expect(h.playing()).toBe(running);
      expect(shownText(running)).toContain("Where were you at nine?");
      expect(host.saves.filter((save) => save.kind === "lastRun")).toEqual([]);
      expect(host.calls.some(([method]) => method === "preview/deleteSaves")).toBe(true);
    } finally {
      await h.controller.stopGame("quit");
      await settle(20);
      h.dispose();
    }
  }, 120_000);
});
