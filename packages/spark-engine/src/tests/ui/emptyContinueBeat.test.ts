// A continue returns at its line's newline, so the next one can complete with
// nothing to show: it runs through logic to the choices, to the story's end, or
// on into more of the story. Choices alone make a beat of their own; a continue
// that brings nothing makes no beat, and no checkpoint.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import {
  BoolValue,
  ObjectValue,
  StringValue,
  type AbstractValue,
} from "@impower/sparkdown/src/inkjs/engine/Value";
import { Game } from "../../game/core/classes/Game";
import { createHarness } from "./harness/uiTestHarness";

const DEFS = `define HERO as character with
  name = "HERO"
end

define VILLAIN as character with
  name = "VILLAIN"
end

layout main with
  textbox:
    character_info:
      character_name:
        text
    dialogue:
      text
    action:
      text
  choice 0:
    text
  choice 1:
    text
end
`;

/** A display table as the runtime hands it to the interpreter. */
const table = (fields: Record<string, string | boolean>) =>
  new ObjectValue(
    new Map<string, AbstractValue>(
      Object.entries(fields).map(([key, value]) => [
        key,
        typeof value === "boolean"
          ? new BoolValue(value)
          : new StringValue(value),
      ]),
    ),
  );

/** The cue a beat shows, if any. */
const cue = (beat: any): string =>
  ((beat?.text?.character_name ?? []) as any[])
    .map((event: any) => event.text ?? "")
    .join("");

describe("a beat of choices alone", () => {
  // A glued continuation's beat after a break inherits the routing of the
  // beat its group names, while that beat is the one just queued. The beat of
  // choices between them carries no table, so it names no routing of its own
  // and the continuation still inherits.
  const inheritedCue = async (between: ObjectValue[]) => {
    const harness = createHarness(`${DEFS}\n-> start\n\nscene start\n  Hi.\nend\n`);
    await harness.ready;
    const interpreter: any = harness.game.module.interpreter;
    interpreter.queue(
      [
        table({
          target: "dialogue",
          character: "HERO",
          text: "A",
          group: "main.sd#1",
          pause: true,
        }),
      ],
      [],
      "A",
    );
    interpreter.flush();
    interpreter.queue(between, between.length ? [] : ["One"], between.length ? "Aside." : "");
    interpreter.flush();
    interpreter.queue(
      [
        table({
          target: "dialogue",
          character: "VILLAIN",
          text: "B",
          group: "main.sd#1",
          inherit: true,
        }),
      ],
      [],
      "B",
    );
    return cue(interpreter.flush());
  };

  test("leaves the remembered routing for a later inherit beat", async () => {
    expect(await inheritedCue([])).toBe("HERO");
  });

  test("a beat with a table between them does not", async () => {
    expect(
      await inheritedCue([table({ target: "action", text: "Aside." })]),
    ).toBe("VILLAIN");
  });
});

const URI = "inmemory:///main.sd";

function compileSrc(src: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: src,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const result = compiler.compile({
    textDocument: { uri: URI },
    countAllVisits: true,
  });
  if (!result.program.compiled) {
    throw new Error("fixture failed to compile");
  }
  return result.program;
}

const SCENE = `-> start

scene start
  One.
  Pick a door.
  choose
    * Left
    * Right
  then
    Through the door.
  end
  Two.
  Last line.
end
`;

describe("a route replay", () => {
  test("takes one checkpoint per beat, and none for a continue that brings nothing", () => {
    const program = compileSrc(SCENE);
    const game = new Game({
      program: program as any,
      now: () => 0,
      setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
        fn(...a);
        return 0;
      }) as any,
    } as any);
    const line = SCENE.split("\n").findIndex((l) => l.includes("Last line."));
    game.setStartFrom({ file: URI, line });
    const toPath = (game as any).startPath as string;
    const route = Game.planRoute(
      game.story,
      program as any,
      Game.getSimulateFromPath(toPath),
      toPath,
    )!;
    expect(route).toBeTruthy();
    // A target the replay never reaches, so it runs on to the story's end,
    // where the continue after the last line ends the story with nothing to
    // flush.
    route.toPath = "start.nowhere";

    const anyGame = game as any;
    let beats = 0;
    const interpreter = anyGame.module.interpreter;
    const flush = interpreter.flush.bind(interpreter);
    interpreter.flush = () => {
      const instructions = flush();
      if (instructions) beats += 1;
      return instructions;
    };
    let checkpoints = 0;
    const checkpoint = anyGame.checkpoint.bind(anyGame);
    anyGame.checkpoint = () => {
      checkpoints += 1;
      return checkpoint();
    };
    // The continues the replay completed with nothing to show, read from
    // the story itself.
    let empty = 0;
    const story: any = game.story;
    const continueAsync = story.ContinueAsync.bind(story);
    story.ContinueAsync = () => {
      continueAsync();
      if (
        story.asyncContinueComplete &&
        !story.currentText &&
        story.currentDisplayInstructions.length === 0 &&
        story.currentChoices.length === 0
      ) {
        empty += 1;
      }
    };

    anyGame.simulateRoute(route);

    expect(game.story.canContinue).toBe(false);
    expect(empty).toBeGreaterThan(0);
    expect(beats).toBeGreaterThan(3);
    expect(checkpoints).toBe(beats);
  });
});

describe("a game", () => {
  test("shows a line before a choose block alone, and its choices after a click", () => {
    const source = `${DEFS}\n-> start\n\nscene start\n  Pick a door.\n  choose\n    * Left\n      Gone left.\n    * Right\n      Gone right.\n  end\nend\n`;
    const game = new Game({
      program: compileSrc(source) as any,
      now: () => 0,
      setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
        fn(...a);
        return 0;
      }) as any,
    } as any);
    const interpreter = (game as any).module.interpreter;
    const flush = interpreter.flush.bind(interpreter);
    const beats: { text: string[]; choices: string[] }[] = [];
    interpreter.flush = () => {
      const instructions = flush();
      if (instructions) {
        beats.push({
          text: Object.entries(instructions.text ?? {})
            .filter(([target]) => !target.startsWith("choice"))
            .map(([, events]) =>
              (events as any[]).map((event) => event.text ?? "").join(""),
            ),
          choices: instructions.choices ?? [],
        });
      }
      return instructions;
    };

    game.start();
    (game as any).jumpToPath("start");
    beats.length = 0;
    game.continue();
    expect(beats).toEqual([{ text: ["Pick a door."], choices: [] }]);

    game.clickedToContinue();
    expect(beats).toHaveLength(2);
    expect(beats[1]!.text).toEqual([]);
    expect(beats[1]!.choices).toHaveLength(2);
  });
});
