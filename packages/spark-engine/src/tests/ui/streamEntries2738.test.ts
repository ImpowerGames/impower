import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";
import type { StreamEntry } from "../../game/modules/ui/types/StreamState";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
  MAIN_URI,
} from "./harness/uiTestHarness";

const MAIN = "file:///local/main.sd";

const LAYOUT = `define RAFFLES as character with
  name = "RAFFLES"
end

define BUNNY as character with
  name = "BUNNY"
end

layout phone {
  thread {
    stream {
      dialogue.bubble { text }
    }
  }
}
`;

const STORY = `${LAYOUT}
scene start
  [[open phone]]
  RAFFLES: slight problem
  RAFFLES: doors locked
  The street is empty.
  BUNNY: Anything you can do about it?
  [[clear phone]]
  RAFFLES: maybe
  [[close phone]]
  The door creaks.
  [[open phone]]
  BUNNY: Hello?
end
`;

function compile(source: string): SparkProgram {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" },
    ] as never,
    seedBuiltinsIntoStory: true,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program as SparkProgram;
}

function play(source = STORY) {
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: compile(source),
  } as never);
  const text = () => (game.story.currentText ?? "").trim();
  const entries = () => game.module.ui.streams.entries("phone") as StreamEntry[];
  const tapTo = (shown: string) => {
    for (let i = 0; i < 12 && text() !== shown; i += 1) {
      game.clickedToContinue();
    }
    expect(text()).toBe(shown);
  };
  return { game, text, entries, tapTo };
}

const said = (entry: StreamEntry) =>
  (entry.text["dialogue"] ?? []).map((event) => event.text).join("");

describe("a stream adds an entry for each line that goes to it (#2738)", () => {
  test("three dialogue lines make three entries in order, and an action line makes none", () => {
    const h = play();
    h.game.start();
    h.tapTo("slight problem");
    expect(h.entries().map(said)).toEqual(["slight problem"]);
    h.tapTo("doors locked");
    h.tapTo("The street is empty.");
    expect(h.entries().map(said)).toEqual(["slight problem", "doors locked"]);
    h.tapTo("Anything you can do about it?");
    expect(h.entries().map(said)).toEqual([
      "slight problem",
      "doors locked",
      "Anything you can do about it?",
    ]);
    expect(h.entries().every((entry) => entry.template === 0)).toBe(true);
    expect(h.entries()[0]!.text["character_name"]?.map((e) => e.text).join("")).toBe("RAFFLES");
  });

  test("clear removes every entry and the next line is the first; close then open starts empty", () => {
    const h = play();
    h.game.start();
    h.tapTo("maybe");
    expect(h.entries().map(said)).toEqual(["maybe"]);
    h.tapTo("The door creaks.");
    expect(h.entries()).toEqual([]);
    h.tapTo("Hello?");
    expect(h.entries().map(said)).toEqual(["Hello?"]);
  });

  test("clicking to finish a line does not add its entry twice", () => {
    const h = play();
    h.game.start();
    h.tapTo("slight problem");
    h.game.clickedToContinue();
    expect(h.text()).toBe("doors locked");
    expect(h.entries().map(said)).toEqual(["slight problem", "doors locked"]);
  });
});

describe("saves, checkpoints and the preview keep a stream's entries (#2738)", () => {
  test("a checkpoint restores the entries up to its line, and a save loads with them", () => {
    const h = play();
    h.game.start();
    h.tapTo("doors locked");
    const checkpointAt = h.game.checkpoints.length - 1;
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();
    h.tapTo("Anything you can do about it?");
    expect(h.entries()).toHaveLength(3);

    expect(h.game.restoreCheckpoint(checkpointAt)).toBe(true);
    expect(h.entries().map(said)).toEqual(["slight problem", "doors locked"]);

    const loaded = play();
    expect(loaded.game.loadToResume(saved!.data)).toBe(true);
    loaded.game.start();
    expect(loaded.entries().map(said)).toEqual(["slight problem", "doors locked"]);
    loaded.tapTo("Anything you can do about it?");
    expect(loaded.entries().map(said)).toEqual([
      "slight problem",
      "doors locked",
      "Anything you can do about it?",
    ]);
  });

  test("rolling back a line shows the entries the game had at that line", async () => {
    const h = play();
    h.game.start();
    h.tapTo("Anything you can do about it?");
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    expect(h.text()).toBe("The street is empty.");
    expect(h.entries().map(said)).toEqual(["slight problem", "doors locked"]);
  });

  test("the preview of the second line shows two entries", async () => {
    const second = STORY.split("\n").findIndex((line) => line.includes("doors locked"));
    const h = createHarness(STORY, second, {
      reactive: true,
      autoOpenAll: false,
      connect: false,
    });
    h.game.setStartFrom({ file: MAIN_URI, line: second });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    await h.preview(second);
    await flushMicrotasks(30);
    expect(
      (h.game.module.ui.streams.entries("phone") as StreamEntry[]).map(said),
    ).toEqual(["slight problem", "doors locked"]);
    const entryWrites = flattenMessages(h.messages).filter(
      (m: any) =>
        m.method === "ui/write-text" &&
        m.params.elements?.length === 1 &&
        ["slight problem", "doors locked"].includes(
          m.params.instructions.map((e: any) => e.text).join(""),
        ),
    );
    expect(entryWrites.length).toBeGreaterThanOrEqual(2);
  });
});
