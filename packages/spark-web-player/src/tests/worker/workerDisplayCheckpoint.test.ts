// The checkpoint a preview compile's route leaves reaches the worker's
// display without a save being written of it and read back (#1758). The
// display loads it in place, and holds what a load of its full save holds.
import type { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

// A `new` instance whose `store` property the route writes, beside globals,
// a table and a condition.
const SOURCE = `define Hero with
  store hp = 10
  title = "wanderer"
end

store trust = 0
store seen = 0
store names = {}
store hero = nil

-> start

scene start
  & trust = trust + 1
  & hero = new Hero()
  HERO:
    The first beat.

  & seen = seen + 1
  & names.first = "hero"
  & hero.hp = hero.hp + 2
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

// The same story, with the instance given a property its class does not
// mark `store`, which a save leaves out and a load of the save reads from
// the class again.
const SOURCE_UNSAVED = SOURCE.replace(
  "  & hero.hp = hero.hp + 2\n",
  "  & hero.hp = hero.hp + 2\n  & hero.title = \"captain\"\n",
);

// The same story, with a named define whose property other than a `store`
// one the route writes: a load of the save merges the define's `store`
// properties into the table it finds and leaves that property as it stands
// there.
const SOURCE_NAMED = SOURCE.replace(
  "store trust = 0\n",
  "define guide with\n  store mood = 1\n  title = \"calm\"\nend\n\nstore trust = 0\n",
).replace(
  "  & hero.hp = hero.hp + 2\n",
  "  & hero.hp = hero.hp + 2\n  & guide.title = \"stern\"\n",
);

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));
const unsavedLineOf = (text: string) =>
  SOURCE_UNSAVED.split("\n").findIndex((l) => l.includes(text));

type CheckpointGame = Game & {
  loadCheckpoint(checkpoint: unknown): boolean;
  checkpointJson(checkpoint: unknown): string | null;
  newestCheckpoint(): unknown;
};

// What a game holds after a load, beyond what its save writes: the runtime
// record's session addresses, choices and conditions, the story's history,
// and the instance's own properties and the title a read of it answers.
const held = (game: Game) => {
  const story = game.programStory;
  const hero = story.variablesState.GetVariableWithName("hero") as {
    value?: Map<string, { value?: unknown }>;
    metatable?: { value?: Map<string, { value?: Map<string, { value?: unknown }> }> };
  } | null;
  const own = hero?.value instanceof Map ? hero.value : null;
  const ownTitle = own?.get("title")?.value;
  const guide = story.variablesState.GetVariableWithName("guide") as {
    value?: Map<string, { value?: unknown }>;
  } | null;
  const guideMap = guide?.value instanceof Map ? guide.value : null;
  const classTitle = hero?.metatable?.value?.get("__index")?.value?.get("title")?.value;
  const save = JSON.parse(game.save());
  const saved = JSON.parse(save.story);
  for (const beat of saved.beats) {
    beat.storySeed = "the game's own";
  }
  save.story = saved;
  return {
    save,
    executed: game.runtimeState.pathsExecutedThisFrame.toArray(),
    choices: game.runtimeState.choicesEncountered,
    conditions: game.runtimeState.conditionsEncountered,
    beats: story.beats.length,
    heroOwn: own ? [...own.keys()].filter((k) => !k.startsWith("__")).sort() : null,
    heroTitle: ownTitle ?? classTitle ?? null,
    heroHp: own?.get("hp")?.value ?? null,
    guideTitle: guideMap?.get("title")?.value ?? null,
  };
};

/** The seed of the newest beat a full save holds. */
const seedOf = (json: string): number => {
  const beats = JSON.parse(JSON.parse(json).story).beats;
  return beats[beats.length - 1].storySeed;
};

/** Compiles `text` with the cursor at `first`, then selects each of
 *  `lines`, and answers what the game held after each checkpoint the
 *  display loaded, and how many of those loads read a save. With
 *  `throughSave`, every display loads the checkpoint's full save. */
async function walk(
  text: string,
  first: number,
  lines: number[],
  throughSave: boolean,
) {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text }],
    startFrom: { file: MAIN_URI, line: first },
  });
  const loads: ReturnType<typeof held>[] = [];
  const read = vi.spyOn(ProgramStory.prototype, "loadSave");
  try {
    await h.compile();
    const game = h.workerState.gameState.game! as CheckpointGame;
    const loadCheckpoint = game.loadCheckpoint.bind(game);
    game.loadCheckpoint = (checkpoint: unknown) => {
      const json = game.checkpointJson(checkpoint)!;
      const loaded = throughSave ? game.load(json) : loadCheckpoint(checkpoint);
      expect(loaded).toBe(true);
      // The seed a game's story starts with comes from the clock, so two
      // games hold different ones: each game's is checked against the save
      // of the checkpoint it loaded, and left out of the comparison.
      expect(game.programStory.state.storySeed).toBe(seedOf(json));
      loads.push(held(game));
      return loaded;
    };
    read.mockClear();
    for (const line of lines) {
      await h.select(line);
      await settle(20);
    }
    return { loads, savesRead: read.mock.calls.length };
  } finally {
    read.mockRestore();
    h.dispose();
  }
}

/** Compiles `text` with the cursor at its last beat, keeps that beat's
 *  checkpoint, puts the story back at the first checkpoint in place, with
 *  the tables of the same run of the declarations, and loads the kept
 *  checkpoint, in place or through its full save. */
async function loadedBack(text: string, throughSave: boolean) {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text }],
    startFrom: {
      file: MAIN_URI,
      line: text.split("\n").findIndex((l) => l.includes("The last beat")),
    },
  });
  try {
    await h.compile();
    const game = h.workerState.gameState.game! as CheckpointGame;
    const checkpoint = game.newestCheckpoint();
    expect(game.restoreCheckpoint(0)).toBe(true);
    expect(held(game).heroHp).toBe(10);
    const json = game.checkpointJson(checkpoint)!;
    const read = vi.spyOn(ProgramStory.prototype, "loadSave");
    expect(
      throughSave ? game.load(json) : game.loadCheckpoint(checkpoint),
    ).toBe(true);
    const savesRead = read.mock.calls.length;
    read.mockRestore();
    expect(game.programStory.state.storySeed).toBe(seedOf(json));
    return { state: held(game), savesRead };
  } finally {
    h.dispose();
  }
}

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
    // Two games, each walked from its own compile: one loads each
    // checkpoint in place, the other its full save.
    const lines = ["The fourth beat", "Trust is", "The first beat", "The last beat"].map(lineOf);
    const inPlace = await walk(SOURCE, lineOf("The last beat"), lines, false);
    const throughSave = await walk(SOURCE, lineOf("The last beat"), lines, true);
    expect(inPlace.loads.length).toBe(4);
    expect(inPlace.savesRead).toBe(0);
    expect(throughSave.savesRead).toBe(4);
    // The instance's store property, which the route wrote, after the beat
    // that writes it, and the title it reads from its class.
    expect(inPlace.loads[0]!.heroOwn).toEqual(["hp"]);
    expect(inPlace.loads[0]!.heroHp).toBe(12);
    expect(inPlace.loads[0]!.heroTitle).toBe("wanderer");
    inPlace.loads.forEach((state, i) => {
      expect({ load: i, state }).toEqual({ load: i, state: throughSave.loads[i] });
    });
  }, 120_000);

  it("holding an instance property a save leaves out, loads as its full save does", async () => {
    // The image keeps the title the route wrote; a save does not write it,
    // and a load of the save makes the instance again without it.
    const lines = ["The fourth beat", "The first beat", "The last beat"].map(unsavedLineOf);
    const inPlace = await walk(SOURCE_UNSAVED, unsavedLineOf("The last beat"), lines, false);
    const throughSave = await walk(SOURCE_UNSAVED, unsavedLineOf("The last beat"), lines, true);
    expect(inPlace.loads.length).toBe(3);
    // Each checkpoint after the write loads through its save; the one before
    // it, at the first beat, holds no such property and loads in place.
    expect(inPlace.savesRead).toBe(2);
    expect(inPlace.loads[0]!.heroTitle).toBe("wanderer");
    expect(inPlace.loads[0]!.heroOwn).toEqual(["hp"]);
    inPlace.loads.forEach((state, i) => {
      expect({ load: i, state }).toEqual({ load: i, state: throughSave.loads[i] });
    });
  }, 120_000);

  it("loaded while the story stands at another beat, holds what its full save holds", async () => {
    // A display can load a checkpoint its log kept while the game has since
    // run elsewhere (a suggestion shown again, say), so the load is what
    // puts the story there. Two games, each loading the first beat's
    // checkpoint once its story stands at the last beat, one in place and
    // one through the full save written of it then.
    const elsewhere = async (throughSave: boolean) => {
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line: lineOf("The last beat") },
      });
      try {
        await h.compile();
        const game = h.workerState.gameState.game! as CheckpointGame;
        await h.select(lineOf("The first beat"));
        const checkpoint = game.newestCheckpoint();
        await h.select(lineOf("The last beat"));
        expect(held(game).heroHp).toBe(12);
        const json = game.checkpointJson(checkpoint)!;
        const read = vi.spyOn(ProgramStory.prototype, "loadSave");
        expect(
          throughSave ? game.load(json) : game.loadCheckpoint(checkpoint),
        ).toBe(true);
        const savesRead = read.mock.calls.length;
        read.mockRestore();
        expect(game.programStory.state.storySeed).toBe(seedOf(json));
        return { state: held(game), savesRead };
      } finally {
        h.dispose();
      }
    };
    const inPlace = await elsewhere(false);
    const throughSave = await elsewhere(true);
    // The first beat's state: the instance made, with its store default.
    expect(inPlace.state.heroHp).toBe(10);
    expect(inPlace.state).toEqual(throughSave.state);
    // The second route ran the declarations again, so the image holds the
    // tables of the run before, and the value loads through its save.
    expect(inPlace.savesRead).toBe(1);
  }, 120_000);

  it("loaded in place while the story stands at another beat of the same run, holds what its full save holds", async () => {
    // The last beat's checkpoint, loaded once the story has been put back
    // at the first checkpoint in place, with the tables of the same run of
    // the declarations: the load in place is what moves the story.
    const inPlace = await loadedBack(SOURCE, false);
    const throughSave = await loadedBack(SOURCE, true);
    expect(inPlace.savesRead).toBe(0);
    // The last beat's state.
    expect(inPlace.state.heroHp).toBe(12);
    expect(inPlace.state).toEqual(throughSave.state);
  }, 120_000);

  it("holding a named define's property its declarations no longer give, loads as its full save does", async () => {
    // The image holds the title the route wrote; a load of the save keeps
    // the title the table holds where the story stands, the first beat's.
    const inPlace = await loadedBack(SOURCE_NAMED, false);
    const throughSave = await loadedBack(SOURCE_NAMED, true);
    expect(inPlace.savesRead).toBe(1);
    expect(throughSave.state.guideTitle).toBe("calm");
    expect(inPlace.state).toEqual(throughSave.state);
  }, 120_000);

  it("taken in a program the game no longer holds, loads as its full save does", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("The fourth beat") },
    });
    try {
      await h.compile();
      const game = h.workerState.gameState.game! as CheckpointGame;
      const checkpoint = game.newestCheckpoint();
      expect(checkpoint == null).toBe(false);
      // The value's full save is the one the store writes of its newest
      // checkpoint.
      expect(game.checkpointJson(checkpoint) === game.checkpoints.at(-1)).toBe(true);
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
    const show = async (throughSave: boolean) => {
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line: lineOf("The last beat") },
      });
      const shown: ReturnType<typeof h.snapshotDOM>[] = [];
      try {
        await h.compile();
        const game = h.workerState.gameState.game! as CheckpointGame;
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
    const inPlace = await show(false);
    const throughSave = await show(true);
    expect(inPlace.length).toBe(3);
    expect(inPlace).toEqual(throughSave);
  }, 120_000);
});
