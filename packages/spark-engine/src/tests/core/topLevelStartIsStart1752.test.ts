import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { TOP_LEVEL_START } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { Game } from "../../game/core/classes/Game";
import { requireChunks } from "../harness/compileProgram";

const MAIN = "inmemory:///main.sd";
const OTHER = "inmemory:///other.sd";

const compile = (scripts: Record<string, string>) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: Object.entries(scripts).map(([uri, text]) => ({
      uri,
      type: "script",
      name: uri.slice(uri.lastIndexOf("/") + 1, -3),
      ext: "sd",
      text,
      version: 1,
      languageId: "sparkdown",
    })),
  } as never);
  return compiler.compile({ textDocument: { uri: MAIN } } as never).program;
};

const newGame = (program: unknown) =>
  new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);

const INTRO_THEN_START = [
  "scene intro",
  "  Intro beat.",
  "  done",
  "end",
  "",
  "scene start",
  "  Start beat.",
  "  -> other",
  "end",
  "",
  "scene other",
  "  Other beat.",
  "  done",
  "end",
  "",
].join("\n");

describe("the top-level start is the first address of start (I-1752)", () => {
  test.each([
    ["declared below another scene of main.sd", { [MAIN]: INTRO_THEN_START }, MAIN, 6],
    [
      "declared in another script",
      {
        [MAIN]: "---\ntitle: Elsewhere\n---\n\nstore visited = false\n",
        [OTHER]: "scene start\n  Start beat.\n  done\nend\n",
      },
      OTHER,
      1,
    ],
  ])("a jump to it lands on start %s", (_, scripts, uri, line) => {
    const program = requireChunks(compile(scripts));
    const locator = programLocator(program as any);
    const first = locator.addressAt(uri, line);
    expect(locator.sceneAt(first)).toBe("start");
    const game: any = newGame(program);
    game.jumpTo(TOP_LEVEL_START);
    expect(game.story.currentAddress).toBe(first);
    expect(String(game.story.Continue() ?? "").trim()).toBe("Start beat.");
  }, 120_000);

  test("a route from the story's start starts at start", () => {
    const program = requireChunks(compile({ [MAIN]: INTRO_THEN_START }));
    const to = programLocator(program as any).addressAt(MAIN, 11)!;
    const game: any = newGame(program);
    const route = Game.planRouteFromStart(game.story, program as any, to);
    expect(route?.from).toBe("start");
    game.jumpToFlow(route!.from);
    expect(String(game.story.Continue() ?? "").trim()).toBe("Start beat.");
  }, 120_000);

  test("a jump to it stands nowhere when no scene is named start", () => {
    const program = compile({ [MAIN]: "scene intro\n  Intro beat.\n  done\nend\n" });
    const game: any = newGame(program);
    game.jumpTo(TOP_LEVEL_START);
    expect(game.story.canContinue).toBe(false);
  }, 120_000);
});
