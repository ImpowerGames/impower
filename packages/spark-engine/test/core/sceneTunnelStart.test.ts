import { describe, expect, test } from "vitest";
import { createHarness, MAIN_URI } from "../ui/harness/uiTestHarness";

const TUNNEL_SCENE = [
  "scene start",
  "  Before.",
  "  -> helper ->",
  "  After.",
  "end",
  "",
  "scene helper",
  "  Inside one.",
  "  Inside two.",
  "  ->->",
  "end",
].join("\n");

const START_TUNNEL = [
  "scene start",
  "  Before.",
  "  ->->",
  "end",
].join("\n");

const watch = (game: any) => {
  const errors: string[] = [];
  game.story.onError = (message: string) => errors.push(message);
  return errors;
};

const preview = async (line: number) => {
  const h = createHarness(TUNNEL_SCENE, line);
  await h.ready;
  const errors = watch(h.game);
  await h.preview(line);
  return { h, errors };
};

const play = async (source: string, line: number) => {
  const h = createHarness(source, line);
  await h.ready;
  const errors = watch(h.game);
  try {
    h.game.setStartFrom({ file: MAIN_URI, line }, "first");
    h.game.start();
    for (let i = 0; i < 20 && h.game.story.canContinue; i++) {
      h.game.step();
    }
  } catch (e) {
    errors.push(String(e));
  }
  return { h, errors };
};

describe("a run that starts inside a scene entered only as a tunnel", () => {
  test("previewing the scene's bare ->-> ends the run without an error", async () => {
    const { h, errors } = await preview(9);
    expect(errors).toEqual([]);
    expect(h.game.story.canContinue).toBe(false);
  });

  test.each([7, 9])("playing from line %i ends the game without an error", async (line) => {
    const { h, errors } = await play(TUNNEL_SCENE, line);
    expect(errors).toEqual([]);
    expect(h.game.story.canContinue).toBe(false);
  });

  test("playing from the story's start keeps the error at a bare ->-> with nothing to return to", async () => {
    const { errors } = await play(START_TUNNEL, 1);
    expect(errors.join(" ")).toContain("->->");
  });
});
