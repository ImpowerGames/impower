import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { Clock } from "../../game/core/classes/Clock";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { Game } from "../../game/core/classes/Game";
import { EventMessage } from "../../game/core/classes/messages/EventMessage";
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

  test("a click that finishes a line's typing keeps one entry for it, and the next click moves on", async () => {
    const source = `${LAYOUT}
scene start
  [[open phone]] RAFFLES: slight problem
  RAFFLES: doors locked
end
`;
    const h = createHarness(source, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    (h.game.context.system as any).previewing = undefined;
    let advanced = 0;
    (h.game as any).clickedToContinue = () => {
      advanced += 1;
    };
    const entries = () =>
      (h.game.module.ui.streams.entries("phone") as StreamEntry[]).map(said);
    const click = () =>
      EventMessage.type.notification({ type: "pointerdown", button: 0 } as never);
    h.jumpToFlow("start");
    let beat = h.nextBeat();
    while (beat && !beat.text?.["dialogue"]) {
      beat = h.nextBeat();
    }
    const coordinator = new Coordinator(h.game, beat!);
    coordinator.onUpdate({ deltaMS: 0 } as Clock);
    await flushMicrotasks(10);
    expect(entries()).toEqual(["slight problem"]);

    coordinator.onMessage(click());
    coordinator.onUpdate({ deltaMS: 0 } as Clock);
    await flushMicrotasks(10);
    expect(advanced).toBe(0);
    expect(entries()).toEqual(["slight problem"]);

    coordinator.onMessage(click());
    coordinator.onUpdate({ deltaMS: 0 } as Clock);
    expect(advanced).toBe(1);
    expect(entries()).toEqual(["slight problem"]);
  });
});

describe("an entry reads the values around its stream (#2738)", () => {
  test("a component parameter used inside an entry follows its argument, as one beside the stream does", async () => {
    const h = createHarness(
      `define RAFFLES as character with
  name = "RAFFLES"
end

store score = 0

function inc()
  score = score + 1
end

component feed(n) {
  label "outside {n}"
  stream {
    dialogue.bubble {
      text
      label "inside {n}"
    }
  }
}

layout main {
  feed(score)
}

scene start
  RAFFLES: slight problem
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    (h.game.context.system as any).previewing = undefined;
    h.jumpToFlow("start");
    let beat = h.nextBeat();
    while (beat && !beat.text?.["dialogue"]) {
      beat = h.nextBeat();
    }
    const coordinator = new Coordinator(h.game, beat!);
    for (let i = 0; i < 5; i += 1) {
      coordinator.onUpdate({ deltaMS: 0 } as Clock);
      await flushMicrotasks(10);
    }
    expect(h.game.module.ui.streams.entries("main")).toHaveLength(1);
    const texts = (value: unknown, found: string[] = []): string[] => {
      if (Array.isArray(value)) {
        value.forEach((v) => texts(v, found));
      } else if (value && typeof value === "object") {
        const text = (value as any).content?.text;
        if (typeof text === "string") {
          found.push(text);
        }
        Object.values(value).forEach((v) => texts(v, found));
      }
      return found;
    };
    expect(texts(h.messages)).toContain("inside 0");

    h.reset();
    (h.game.story as any).EvaluateFunction("inc", []);
    (h.game.module.ui as any).refreshLayouts();
    const updated = texts(h.messages);
    expect(updated).toContain("outside 1");
    expect(updated).toContain("inside 1");
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
