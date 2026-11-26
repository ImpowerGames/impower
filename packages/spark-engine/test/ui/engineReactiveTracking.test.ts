import { describe, expect, test } from "vitest";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { compileUI, createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SOURCE = `store hp = 100

function hit()
  hp = hp - 10
end

layout main {
  column {
    text "HP: {hp}"
    button "Hit" @click=hit
  }
}


scene start
  Hello.
  Goodbye.
end
`;

const variablesOf = (game: any) => game.story.variablesState;

const depsEnabled = (game: any): boolean =>
  variablesOf(game).reactiveDepsEnabled === true;

const withoutLayouts = (program: any) => ({
  ...program,
  sparkle: { ...program.sparkle, layouts: undefined },
});

describe("reactive dependency tracking is a setting of the engine", () => {
  test("an engine built with the option tracks on every state it makes", () => {
    const { program } = compileUI(SOURCE);
    const story = new ProgramStory(program.chunks!, { reactiveDeps: true });
    expect(story.variablesState.reactiveDepsEnabled).toBe(true);
    story.ResetState();
    expect(story.variablesState.reactiveDepsEnabled).toBe(true);
  });

  test("an engine built without the option does not track", () => {
    const { program } = compileUI(SOURCE);
    const story = new ProgramStory(program.chunks!);
    expect(story.variablesState.reactiveDepsEnabled).toBe(false);
    story.ResetState();
    expect(story.variablesState.reactiveDepsEnabled).toBe(false);
  });

  test("layout mount finds it on", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    expect(depsEnabled(h.game)).toBe(true);
  });

  test("rewindStory (the STOP then PLAY restart path) keeps it", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const before = variablesOf(h.game);
    (h.game as any).rewindStory();
    expect(variablesOf(h.game) === before).toBe(false);
    expect(depsEnabled(h.game)).toBe(true);
  });

  test("updateProgram (the live-edit recompile path) builds an engine with it on", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const before = h.game.story;
    const { program } = compileUI(SOURCE);
    (h.game as any).updateProgram(program);
    expect(h.game.story === before).toBe(false);
    expect(depsEnabled(h.game)).toBe(true);
  });

  test("updateProgram to a program without layouts builds an engine with it off", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const { program } = compileUI(SOURCE);
    (h.game as any).updateProgram(withoutLayouts(program));
    expect(depsEnabled(h.game)).toBe(false);
    (h.game as any).rewindStory();
    expect(depsEnabled(h.game)).toBe(false);
  });

  test("checkpoint restore keeps it", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const { program } = compileUI(SOURCE);
    (h.game as any).updateProgram(program);
    h.game.checkpoint();
    variablesOf(h.game).$("hp", 42);
    expect(h.game.restoreCheckpoint(h.game.checkpoints.length - 1)).toBe(true);
    expect(variablesOf(h.game).$("hp")).toBe(100);
    expect(depsEnabled(h.game)).toBe(true);
  });

  test("a preview jump keeps it", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const { program } = compileUI(SOURCE);
    (h.game as any).updateProgram(program);
    const before = variablesOf(h.game);
    await h.preview(16);
    expect(h.game.previewedAddress).toBeTruthy();
    expect(variablesOf(h.game) === before).toBe(false);
    expect(depsEnabled(h.game)).toBe(true);
  });

  test("updateProgram invalidates the preview memo", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    await h.preview();
    expect(h.game.previewedAddress).toBeTruthy();
    const { program } = compileUI(SOURCE);
    (h.game as any).updateProgram(program);
    expect(h.game.previewedAddress).toBeUndefined();
    expect((h.game as any).context.system.previewing).toBeTruthy();
  });

  test("the full PLAY fail-branch flow keeps tracking and paints a clicked refresh", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const buttonId = h.observedElementIds()[0]!;
    expect(buttonId).toBeTruthy();
    (h.game as any)._simulation = "fail";
    h.game.start();
    await flushMicrotasks(10);
    expect(depsEnabled(h.game)).toBe(true);

    h.reset();
    h.emitEvent("click", buttonId);
    await flushMicrotasks(10);
    expect(JSON.stringify(h.messages)).toContain("HP: 90");
  });

  test("start() forces the first refresh to repaint what the reset changed", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const buttonId = h.observedElementIds()[0]!;
    h.reset();
    h.emitEvent("click", buttonId);
    await flushMicrotasks(10);
    expect(JSON.stringify(h.messages)).toContain("HP: 90");

    h.reset();
    (h.game as any)._simulation = "fail";
    h.game.start();
    await flushMicrotasks(10);
    (h.game.module.ui as any).refreshLayouts();
    expect(JSON.stringify(h.messages)).toContain("HP: 100");
  });

  test("a force-all refresh repaints a binding whose memo already matches", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const buttonId = h.observedElementIds()[0]!;
    h.reset();
    h.emitEvent("click", buttonId);
    await flushMicrotasks(10);
    expect(JSON.stringify(h.messages)).toContain("HP: 90");

    h.reset();
    const ui = h.game.module.ui as any;
    ui.onStart();
    ui.refreshLayouts();
    expect(JSON.stringify(h.messages)).toContain("HP: 90");
  });

  test("no reactive refresh runs while the route simulation is active", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const buttonId = h.observedElementIds()[0]!;
    (h.game.context.system as any).simulating = true;
    h.reset();
    h.emitEvent("click", buttonId);
    await flushMicrotasks(10);
    expect(JSON.stringify(h.messages)).not.toContain("HP: 90");

    (h.game.context.system as any).simulating = undefined;
    (h.game.module.ui as any).refreshLayouts();
    expect(JSON.stringify(h.messages)).toContain("HP: 90");
  });
});
