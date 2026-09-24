// #815 — what a running game reports when the story raises a runtime error or
// warning.
//
// A warning marks something the runtime recovered from, so the story plays on
// past it; an error ends the story. Either way, the report names the statement
// that raised it (not the statement that ran before it) and carries the bare
// message, since the location travels separately.

import { describe, expect, test } from "vitest";
import type { Game } from "../../game/core/classes/Game";
import { createHarness } from "../ui/harness/uiTestHarness";

const CONTINUES_WARNING =
  "This line begins with `..`, but the line before it had already ended.";

const runtimeErrors = (messages: any[]) =>
  messages.filter((m) => m.method === "game/runtimeError").map((m) => m.params);

/** Connect the game and start playing it from the top, as PLAY does. */
const play = async (source: string) => {
  const h = createHarness(source, 0);
  await h.ready;
  h.reset();
  h.game.start();
  return h;
};

/** The 0-based line the game last executed. */
const executingLine = (h: { game: Game }) =>
  h.game.getLastExecutedDocumentLocation()?.range.start.line;

describe("a runtime warning", () => {
  const SOURCE = `store x = 0\nA\n& x = 1\n.. B\nC\n`;

  test("leaves the game running, and the next step executes", async () => {
    const h = await play(SOURCE);
    expect(runtimeErrors(h.messages)).toEqual([]);
    // The beat after `A` shows `B`, whose `..` the line before did not leave
    // open.
    h.game.continue();
    const warnings = runtimeErrors(h.messages);
    expect(warnings.map((w) => [w.type, w.message])).toEqual([
      [2, CONTINUES_WARNING],
    ]);
    expect(warnings[0].location.range.start.line).toBe(3);
    expect(h.game.state).toBe("running");
    expect(h.game.story.canContinue).toBe(true);

    h.reset();
    h.game.continue();
    expect(runtimeErrors(h.messages)).toEqual([]);
    expect(executingLine(h)).toBe(4);
  });
});

describe("a runtime error", () => {
  test("ends the story", async () => {
    const h = await play(`A\nB {error("boom")}\nC\n`);
    h.game.continue();
    const errors = runtimeErrors(h.messages);
    expect(errors.map((e) => [e.type, e.message])).toEqual([[1, "boom"]]);
    expect(h.game.story.canContinue).toBe(false);
  });

  test("raised in a display line is reported on that line", async () => {
    const h = await play(`A\n{error("boom")} B\nC\n`);
    h.game.continue();
    const errors = runtimeErrors(h.messages);
    expect(errors[0].location.range.start.line).toBe(1);
    expect(errors.map((e) => e.message)).toEqual(["boom"]);
  });

  test("raised inside a function a display line calls is reported where the function raised it", async () => {
    const h = await play(
      `function f()\n  error("deep")\nend\n\nA\nB {f()}\nC\n`,
    );
    h.game.continue();
    const errors = runtimeErrors(h.messages);
    expect(errors[0].location.range.start.line).toBe(1);
    expect(errors.map((e) => e.message)).toEqual(["deep"]);
  });

  // A handler runs between steps, so the last step the game ran says nothing
  // about where the handler's function raised its error. The error ends the
  // story, and it is the only report: what the ended evaluation throws after
  // it is not reported again at the last step's line.
  test("raised inside a function a click handler calls is reported once, where the function raised it", async () => {
    const h = createHarness(
      `A\nB\nC\n\nstore hp = 100\nfunction heal()\n  hp = hp + 5\n  error("broken heal")\nend\nlayout hud with\n  button "Heal" @click=heal\nend\n`,
      0,
    );
    await h.ready;
    h.game.start();
    expect(executingLine(h)).toBe(0);
    const button = h.observedElementIds()[0]!;
    h.reset();
    h.emitEvent("click", button);
    const errors = runtimeErrors(h.messages);
    expect(errors.map((e) => [e.location.range.start.line, e.message])).toEqual(
      [[7, "broken heal"]],
    );
  });

  // A handler's function runs synchronously, so the callbacks it reaches run
  // too, from host code that restores the caller's position as the error
  // unwinds. The report still names the statement inside the callback.
  const clickReports = async (source: string) => {
    const h = createHarness(source, 0);
    await h.ready;
    h.game.start();
    const button = h.observedElementIds()[0]!;
    h.reset();
    h.emitEvent("click", button);
    return runtimeErrors(h.messages).map((e) => [
      e.location.range.start.line,
      e.message,
    ]);
  };
  const lineOf = (source: string, text: string) =>
    source.split("\n").findIndex((line) => line.includes(text));

  test("raised inside a metamethod a click handler reaches is reported where the metamethod raised it", async () => {
    const source = `A\nB\n\nstore obj = setmetatable({}, { __index = function(t, k)\n  error("bad index")\nend })\n\nfunction read_item()\n  local value = obj.missing\nend\n\nlayout hud with\n  button "Read" @click=read_item\nend\n`;
    expect(await clickReports(source)).toEqual([
      [lineOf(source, `error("bad index")`), "bad index"],
    ]);
  });

  test("raised inside a comparator a click handler's sort calls is reported where the comparator raised it", async () => {
    const source = `A\nB\n\nstore items = {3, 1, 2}\n\nfunction compare(a, b)\n  error("bad compare")\nend\n\nfunction sort_items()\n  table.sort(items, compare)\nend\n\nlayout hud with\n  button "Sort" @click=sort_items\nend\n`;
    expect(await clickReports(source)).toEqual([
      [
        lineOf(source, `error("bad compare")`),
        expect.stringMatching(/bad compare$/),
      ],
    ]);
  });

  test("carries no runtime location prefix in its message", async () => {
    const h = await play(`A\nB {error("boom")}\nC\n`);
    h.game.continue();
    for (const { message } of runtimeErrors(h.messages)) {
      expect(message).not.toMatch(/^RUNTIME (ERROR|WARNING):/);
    }
    expect(runtimeErrors(h.messages)).toHaveLength(1);
  });
});
