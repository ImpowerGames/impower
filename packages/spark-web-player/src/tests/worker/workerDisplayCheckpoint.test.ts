// The checkpoint a preview compile's route leaves reaches the worker's
// display without a save being written of it and read back (#1758). The
// display loads it in place, and holds what a load of its full save holds.
import type { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `store trust = 0
store seen = 0
store names = {}

-> start

scene start
  & trust = trust + 1
  HERO:
    The first beat.

  & seen = seen + 1
  & names.first = "hero"
  HERO:
    The second beat.

  if trust > 0 then
    & trust = trust + 10
    HERO:
      Trust is {trust}.
  else
    HERO:
      Nobody trusts anyone.
  end

  & seen = seen + 1
  HERO:
    The fourth beat, seen {seen}.

  HERO:
    The last beat, with {names.first}.
end
`;

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the route's checkpoint, handed to the display", () => {
  it("is neither written as a save nor read back from one", async () => {
    const written = vi.spyOn(ProgramStory.prototype, "saveOfImage");
    const read = vi.spyOn(ProgramStory.prototype, "loadSave");
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("The last beat") },
    });
    try {
      await h.compile();
      await settle(40);
      // A positive control: the display shows the routed beat.
      expect(h.overlay.textContent).toContain("The last beat, with hero.");
      await h.select(lineOf("The fourth beat"));
      expect(h.overlay.textContent).toContain("The fourth beat, seen 2.");
      await h.select(lineOf("Trust is"));
      expect(h.overlay.textContent).toContain("Trust is 11.");

      expect({
        savesWritten: written.mock.calls.length,
        savesRead: read.mock.calls.length,
      }).toEqual({ savesWritten: 0, savesRead: 0 });
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("holds the state a load of its full save holds", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("The last beat") },
    });
    const compared: {
      line: string;
      value: unknown;
      save: unknown;
    }[] = [];
    // What a game holds beyond its save: the runtime record's session
    // addresses, which a save writes durably, and its choices and
    // conditions.
    const held = (game: Game) => ({
      save: JSON.parse(game.save()),
      executed: game.runtimeState.pathsExecutedThisFrame.toArray(),
      choices: game.runtimeState.choicesEncountered,
      conditions: game.runtimeState.conditionsEncountered,
      beats: game.programStory.beats.length,
    });
    try {
      // The worker builds its game on the first compile; each load of a
      // checkpoint value from then on is compared, on the same game, with a
      // load of the save the string form writes of it at that moment.
      await h.compile();
      const game = h.workerState.gameState.game! as Game & {
        loadCheckpoint(checkpoint: unknown): boolean;
        checkpointJson(checkpoint: unknown): string | null;
      };
      const loadCheckpoint = game.loadCheckpoint.bind(game);
      let line = "";
      game.loadCheckpoint = (checkpoint: unknown) => {
        const json = game.checkpointJson(checkpoint);
        expect(json).toBeTruthy();
        expect(game.load(json!)).toBe(true);
        const save = held(game);
        expect(loadCheckpoint(checkpoint)).toBe(true);
        const value = held(game);
        compared.push({ line, value, save });
        return true;
      };
      for (const beat of [
        "The fourth beat",
        "Trust is",
        "The first beat",
        "The last beat",
      ]) {
        line = beat;
        await h.select(lineOf(beat));
      }
      expect(compared.map((c) => c.line)).toEqual([
        "The fourth beat",
        "Trust is",
        "The first beat",
        "The last beat",
      ]);
      for (const { line, value, save } of compared) {
        expect({ line, state: value }).toEqual({ line, state: save });
      }
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("taken in a program the game no longer holds, loads as its full save does", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("The fourth beat") },
    });
    try {
      await h.compile();
      const game = h.workerState.gameState.game! as Game & {
        newestCheckpoint(): unknown;
        loadCheckpoint(checkpoint: unknown): boolean;
        checkpointJson(checkpoint: unknown): string | null;
      };
      const checkpoint = game.newestCheckpoint();
      expect(checkpoint == null).toBe(false);
      // An edit above the checkpoint's beat: the game holds a program whose
      // root is another one.
      const line = lineOf("The first beat.");
      const text = "    The first beat.";
      await h.edit([
        {
          range: {
            start: { line, character: 0 },
            end: { line, character: text.length },
          },
          text: "    The first beat, edited.",
        },
      ]);
      await h.compile();
      const json = game.checkpointJson(checkpoint);
      expect(json).toBeTruthy();
      expect(game.load(json!)).toBe(true);
      const save = game.save();
      // The image names chunks of the root before the edit, which a load
      // places through its saved form, so the value loads through its save.
      const read = vi.spyOn(ProgramStory.prototype, "loadSave");
      expect(game.loadCheckpoint(checkpoint)).toBe(true);
      expect(read.mock.calls.length).toBe(1);
      expect(game.save()).toBe(save);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("shows the same beat as a display that loads the full save", async () => {
    const walk = async (throughSave: boolean) => {
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line: lineOf("The last beat") },
      });
      const shown: ReturnType<typeof h.snapshotDOM>[] = [];
      try {
        await h.compile();
        const game = h.workerState.gameState.game! as Game & {
          loadCheckpoint(checkpoint: unknown): boolean;
          checkpointJson(checkpoint: unknown): string | null;
        };
        if (throughSave) {
          game.loadCheckpoint = (checkpoint: unknown) =>
            game.load(game.checkpointJson(checkpoint)!);
        }
        for (const beat of ["The fourth beat", "The first beat", "The last beat"]) {
          await h.select(lineOf(beat));
          await settle(40);
          shown.push(h.snapshotDOM());
        }
      } finally {
        h.dispose();
      }
      return shown;
    };
    const inPlace = await walk(false);
    const throughSave = await walk(true);
    expect(inPlace.length).toBe(3);
    expect(inPlace).toEqual(throughSave);
  }, 120_000);
});
