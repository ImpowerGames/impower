import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "../../game/core/classes/Game";
import { requireChunks } from "../harness/compileProgram";

const URI = "inmemory:///main.sd";

const compile = (text: string) => {
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
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return requireChunks(
    compiler.compile({ textDocument: { uri: URI } } as never).program,
  );
};

const routeTo = (text: string, line: number) => {
  const program = compile(text);
  const game = new Game({
    program: program as any,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);
  const anyGame = game as any;
  game.setStartFrom({ file: URI, line }, "last");
  const to = anyGame.startAddress as number;
  const route = Game.planRoute(game.story, program as any, anyGame.routeStartOf(to), to);
  expect(route).toBeTruthy();
  game.patchAndSimulateRoute(route!);
  expect(anyGame._simulation).toBe("success");
  return { shows: game.routeTargetShows, ending: game.routeTargetEnding };
};

const DONE = "scene start(x)\n  Hello.\n  done\nend\n";
const FIN = "scene start\n  Hello.\n  fin\n  Never shown.\nend\n";
const CONTENT = "scene start\n  Hello.\n  Goodbye.\nend\n";
const ERROR = 'scene start\n  Hello.\n  & error("boom")\n  Goodbye.\nend\n';
const THREAD =
  "scene start\n  First.\n  <- start.aside\n  After.\n  done\n  branch aside\n    Aside.\n    done\n  end\nend\n";
const CHOICES =
  "scene start\n  Pick.\n  <- offer\n  done\nend\n\nscene offer\n  choose\n    + [Yes]\n      Yes.\n  end\n  done\nend\n";
const DEEP =
  "scene start\n  Hello.\n  & local a = 1\n  & local n = recurse(6000)\n  fin\nend\n\nfunction recurse(n)\n  if n == 0 then\n    return 0\n  end\n  return 1 + recurse(n - 1)\nend\n";
const DIVERT ="scene start\n  Hello.\n  -> quiet\nend\n\nscene quiet\nend\n";

describe("the route search's answer to how the run from a line ends", () => {
  test("a done with nothing left to run ran out", () => {
    const { shows, ending } = routeTo(DONE, 2);
    expect(shows).toBe(true);
    expect(ending?.kind).toBe("out");
    expect(ending?.location?.range.start.line).toBe(2);
  });

  test("the content's last beat is not an ending, since the game waits there", () => {
    expect(routeTo(CONTENT, 2).ending).toBeNull();
  });

  test("a divert into a flow that ends at once ran out", () => {
    expect(routeTo(DIVERT, 2).ending?.kind).toBe("out");
  });

  test("a fin ended the story with fin", () => {
    const { ending } = routeTo(FIN, 2);
    expect(ending?.kind).toBe("fin");
    expect(ending?.location?.range.start.line).toBe(2);
  });

  test("a line that raises a runtime error stopped by the error, naming its message and line", () => {
    const { ending } = routeTo(ERROR, 2);
    expect(ending?.kind).toBe("error");
    expect(ending?.error?.message).toContain("boom");
    expect(ending?.error?.location.range.start.line).toBe(2);
  });

  test.each([
    ["the line that recurses too deep", 3],
    ["a line before it, with no beat between", 2],
  ])(
    "%s stopped by the engine's call-depth error",
    (_name, line) => {
      const { ending } = routeTo(DEEP, line);
      expect(ending?.kind).toBe("error");
      expect(ending?.error?.message).toMatch(/^Calls nested more than \d+ deep/);
    },
  );

  test("the last beat's own line is not an ending", () => {
    expect(routeTo(DONE, 1).ending).toBeNull();
  });

  test("a done that ends a thread is not an ending, since the run goes on", () => {
    const { shows, ending } = routeTo(THREAD, 7);
    expect(shows).toBe(true);
    expect(ending).toBeNull();
  });

  test("a done reached with choices on screen is not an ending", () => {
    expect(routeTo(CHOICES, 3).ending).toBeNull();
  });
});
