// #835 — PLAY or a preview from a line with no story flow of its own.
//
// A `store` whose value is a function literal, a `function` declaration's
// header and the lines of a function's body hold only function rows. A run
// from such a line starts at the story's next line of flow after it, or at the
// top of the story when none follows; a preview of the line shows what that
// start shows. Neither runs the function's body as story.

import { describe, expect, test } from "vitest";
import { Game } from "../../game/core/classes/Game";
import { findClosestPathLocation } from "../../game/core/utils/findClosestPathLocation";
import {
  compileUI,
  createHarness,
  MAIN_URI,
} from "../ui/harness/uiTestHarness";

const runtimeErrors = (messages: any[]) =>
  messages
    .filter((m) => m.method === "game/runtimeError")
    .map((m) => m.params.message);

/** Every character the engine wrote to the screen, across all targets. */
const writtenText = (harness: any): string =>
  harness
    .snapshotFiltered("ui/write-text")
    .map((m: any) =>
      (m?.params?.instructions ?? []).map((i: any) => i.text ?? "").join(""),
    )
    .join(" ");

/** Press PLAY with the cursor on `line`. */
const playFrom = async (source: string, line: number) => {
  const h = createHarness(source, line);
  await h.ready;
  h.reset();
  const startFrom = h.game.setStartFrom({ file: MAIN_URI, line }, "first");
  h.game.start();
  return {
    startLine: startFrom?.line,
    executedLine: h.game.getLastExecutedDocumentLocation()?.range.start.line,
    errors: runtimeErrors(h.messages),
    running: h.game.state === "running",
  };
};

/** Preview `line`, as the editor does when the cursor rests on it. */
const previewOf = async (source: string, line: number) => {
  const h = createHarness(source, line);
  await h.ready;
  h.reset();
  const path = await h.preview(line);
  return { path, errors: runtimeErrors(h.messages), text: writtenText(h) };
};

describe("a store whose value is a function literal (#835)", () => {
  const SOURCE = [
    `store obj = setmetatable({}, { __index = function(t, k) return "found" end })`,
    ``,
    `A`,
    `B`,
    `C`,
    ``,
  ].join("\n");

  test("PLAY from its line starts at the story line after it", async () => {
    const run = await playFrom(SOURCE, 0);
    expect(run.errors).toEqual([]);
    expect(run.startLine).toBe(2);
    expect(run.executedLine).toBe(2);
    expect(run.running).toBe(true);
  });

  test("a preview of its line shows the story line after it", async () => {
    const shown = await previewOf(SOURCE, 0);
    expect(shown.errors).toEqual([]);
    expect(shown.path).not.toContain("__synth_");
    expect(shown.text).toContain("A");
  });
});

// The function is followed by a scene rather than by root story lines: root
// lines after a function are compiled into its body (#834).
describe("a function declaration before a scene (#835)", () => {
  const SOURCE = [
    `A`,
    ``,
    `function less(a, b)`,
    `  return a < b`,
    `end`,
    ``,
    `scene later`,
    `B`,
    `C`,
    ``,
  ].join("\n");

  test.each([
    ["its header", 2],
    ["its body", 3],
    ["its end", 4],
  ])("PLAY from %s starts where PLAY from the scene does", async (_, line) => {
    const run = await playFrom(SOURCE, line);
    expect(run.errors).toEqual([]);
    expect(run.running).toBe(true);
    expect(run).toEqual(await playFrom(SOURCE, 6));
  });

  test("a preview of its header shows what a preview of the scene shows", async () => {
    const shown = await previewOf(SOURCE, 2);
    expect(shown.errors).toEqual([]);
    expect(shown.path?.split(".")[0]).toBe("later");
    expect(shown).toEqual(await previewOf(SOURCE, 6));
  });
});

describe("a function declaration after the last story line (#835)", () => {
  const SOURCE = [
    `A`,
    `B`,
    ``,
    `function less(a, b)`,
    `  return a < b`,
    `end`,
    ``,
  ].join("\n");

  test("PLAY from its header starts at the top of the story", async () => {
    const run = await playFrom(SOURCE, 3);
    expect(run.errors).toEqual([]);
    expect(run.executedLine).toBe(0);
    expect(run.running).toBe(true);
  });
});

describe("the lines of a function body still resolve for the debugger (#835)", () => {
  test("a breakpoint on a body line stays in the function", () => {
    const SOURCE = [
      `A {less(1, 2)}`,
      `B`,
      ``,
      `function less(a, b)`,
      `  return a < b`,
      `end`,
      ``,
    ].join("\n");
    const { program } = compileUI(SOURCE);
    const scripts = Object.keys(program.scripts);
    const found = findClosestPathLocation(
      { file: MAIN_URI, line: 4 },
      program.pathLocations,
      scripts,
    );
    expect(found?.[0].split(".")[0]).toBe("less");
    const [placed] = Game.getActualBreakpoints(
      program.pathLocations,
      [{ file: MAIN_URI, line: 4 }],
      scripts,
    );
    expect(placed).toMatchObject({ verified: true });
  });
});
