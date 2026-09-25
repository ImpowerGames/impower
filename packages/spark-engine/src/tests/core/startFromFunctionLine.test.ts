// A line with no story flow of its own (a function's header or body, or a
// `store` whose value holds a function literal) is not a place a run can
// begin. PLAY or a preview from it starts at the next line of story flow after
// it, and a breakpoint on a function's body still stops there (#835).

import { describe, expect, test } from "vitest";
import { findClosestPathLocation } from "../../game/core/utils/findClosestPathLocation";
import {
  createHarness,
  flushMicrotasks,
  MAIN_URI,
} from "../ui/harness/uiTestHarness";

/** Everything the game has sent to the page, as text to search. */
const sent = (harness: any): string => JSON.stringify(harness.messages);

/** Where the story stands after a start: the root flow's paths begin `0.`. */
const storyPath = (game: any): string => game._story.state.currentPathString;

/** Records the runtime errors the game reports from now on. */
const recordErrors = (game: any): string[] => {
  const errors: string[] = [];
  game.connection.emit = ((emit) => (message: any) => {
    if (message?.method === "game/runtimeError") {
      errors.push(message.params.message);
    }
    return emit(message);
  })(game.connection.emit.bind(game.connection));
  return errors;
};

const FUNCTION_FIRST = `function less(a, b)
  return a < b
end

First line.
Second line.
`;

const STORE_LITERAL = `store obj = setmetatable({}, { __index = function(t, k) return "found" end })

First line.
Second line.
`;

const HELPER_FIRST = `store hp = 100

function hit()
  hp = hp - 10
end

HP is {hp}.
`;

const FUNCTION_IN_SCENE = `-> intro

scene intro
  First line.
  function less(a, b)
    return a < b
  end
  Second line.
end
`;

const FUNCTION_LAST = `First line.
Second line.

function less(a, b)
  return a < b
end
`;

describe("starting from a line with no story flow (#835)", () => {
  test("PLAY from a function's header starts at the story line after the function", async () => {
    const harness = createHarness(FUNCTION_FIRST, 0);
    await harness.ready;
    const game: any = harness.game;
    const errors = recordErrors(game);
    expect(game.setStartFrom({ file: MAIN_URI, line: 0 })).toEqual({
      file: MAIN_URI,
      line: 4,
    });
    game.start();
    await flushMicrotasks(20);
    expect(storyPath(game)).toMatch(/^0\./);
    expect(errors).toEqual([]);
  });

  test("PLAY from a line of a function's body starts at the story line after the function", async () => {
    const harness = createHarness(FUNCTION_FIRST, 1);
    await harness.ready;
    const game: any = harness.game;
    expect(game.setStartFrom({ file: MAIN_URI, line: 1 })).toEqual({
      file: MAIN_URI,
      line: 4,
    });
  });

  test("PLAY from a store line whose value holds a function literal starts at the story", async () => {
    const harness = createHarness(STORE_LITERAL, 0);
    await harness.ready;
    const game: any = harness.game;
    const errors = recordErrors(game);
    expect(game.setStartFrom({ file: MAIN_URI, line: 0 })).toEqual({
      file: MAIN_URI,
      line: 2,
    });
    game.start();
    await flushMicrotasks(20);
    expect(storyPath(game)).toMatch(/^0\./);
    expect(errors).toEqual([]);
  });

  test("PLAY from the top runs no function body on the way to the story", async () => {
    const harness = createHarness(HELPER_FIRST, 0);
    await harness.ready;
    const game: any = harness.game;
    const errors = recordErrors(game);
    game.setStartFrom({ file: MAIN_URI, line: 0 });
    game.start();
    await flushMicrotasks(20);
    expect(storyPath(game)).toMatch(/^0\./);
    expect(game._story.variablesState["hp"]).toBe(100);
    expect(errors).toEqual([]);
  });

  test("PLAY from a function declared inside a scene starts at the scene's line after it", async () => {
    const harness = createHarness(FUNCTION_IN_SCENE, 0);
    await harness.ready;
    const game: any = harness.game;
    const errors = recordErrors(game);
    expect(game.setStartFrom({ file: MAIN_URI, line: 5 })).toEqual({
      file: MAIN_URI,
      line: 7,
    });
    game.start();
    await flushMicrotasks(20);
    expect(storyPath(game)).toMatch(/^intro\./);
    expect(errors).toEqual([]);
  });

  test("PLAY from a function with no story line after it starts at the top of the story", async () => {
    const harness = createHarness(FUNCTION_LAST, 0);
    await harness.ready;
    const game: any = harness.game;
    const errors = recordErrors(game);
    expect(game.setStartFrom({ file: MAIN_URI, line: 4 })).toBeNull();
    game.start();
    await flushMicrotasks(20);
    expect(storyPath(game)).toMatch(/^0\./);
    expect(errors).toEqual([]);
  });

  test("a preview of a function's header shows the story line after the function", async () => {
    const harness = createHarness(FUNCTION_FIRST, 0);
    await harness.ready;
    const game: any = harness.game;
    const errors = recordErrors(game);
    harness.reset();
    expect(await harness.preview(0)).toBeTruthy();
    expect(sent(harness)).toContain("First line.");
    expect(errors).toEqual([]);
  });

  test("a breakpoint on a line of a function's body still resolves inside the function", async () => {
    const harness = createHarness(FUNCTION_FIRST, 0);
    await harness.ready;
    const program: any = harness.game.program;
    const found = findClosestPathLocation(
      { file: MAIN_URI, line: 1 },
      program.pathLocations,
      Object.keys(program.scripts ?? {}),
    );
    expect(found?.[0]).toMatch(/^less\./);
  });
});
