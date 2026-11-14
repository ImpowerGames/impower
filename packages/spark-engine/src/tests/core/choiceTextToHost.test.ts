import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";

const MAIN = "file:///local/main.sd";

const FIXTURE = [
  "store name = \"*Nova*\"",
  "",
  "scene start",
  "  The gate.",
  "  choose",
  "    * [*Pay* the **toll**, {name}.]",
  "      Paid.",
  "    * Climb _over_ [~~the~~ wall] ^now^",
  "      Climbed.",
  "    * Leave *now",
  "      Left.",
  "  end",
  "  The end.",
  "end",
  "",
].join("\n");

function compile(source: string): SparkProgram {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ] as never,
    seedBuiltinsIntoStory: true,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program as SparkProgram;
}

function play(source = FIXTURE) {
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: compile(source),
  } as never);
  const chosen: { text: string; checkpoint: number }[] = [];
  game.connection.outgoing.addListener("*", (message: any) => {
    if (message.method === "game/chosePathToContinue") chosen.push(message.params);
  });
  const atMenu = () => game.story.currentChoices.length > 0;
  const tapUntil = (done: () => boolean) => {
    for (let i = 0; i < 8 && !done(); i += 1) game.clickedToContinue();
    expect(done()).toBe(true);
  };
  return { game, chosen, atMenu, tapUntil };
}

describe("the choice text the engine sends to the host is plain", () => {
  test("the made choice's text has no marks, a value's own included", () => {
    const h = play();
    h.game.start();
    h.tapUntil(h.atMenu);
    h.game.chosePathToContinue(0);
    expect(h.chosen.map((made) => made.text)).toEqual(["Pay the toll, Nova."]);
  });

  test("a settled beat's choices have no marks", async () => {
    const h = play();
    h.game.start();
    h.tapUntil(h.atMenu);
    h.game.chosePathToContinue(1);
    const rolled = await h.game.rollBack("choice", h.chosen[0]!.checkpoint);
    expect(rolled).toMatchObject({
      moved: true,
      restored: { choices: ["Pay the toll, Nova.", "Climb over the wall", "Leave *now"], chosen: 1 },
    });
  });
});

describe("the choice text the engine sends to the host has no tags", () => {
  test("a known and an unknown tag are both removed", () => {
    const h = play(
      [
        "scene start",
        "  choose",
        "    * Go <b>far</b> <b2>x</b2> [<speed:0.5>now] later",
        "      Gone.",
        "  end",
        "end",
        "",
      ].join("\n"),
    );
    h.game.start();
    h.tapUntil(h.atMenu);
    h.game.chosePathToContinue(0);
    expect(h.chosen.map((made) => made.text)).toEqual(["Go far x now"]);
  });
});
