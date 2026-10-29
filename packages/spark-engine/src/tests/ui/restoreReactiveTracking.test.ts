import { describe, expect, test } from "vitest";
import { compileUI, createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SOURCE = `store hp = 100

function hit()
  hp = hp - 10
end

layout main with
  column {
    text "HP: {hp}"
    button "Hit" @click=hit
  }
end

-> start
scene start
  Hello.
end
`;

const depsEnabled = (game: any): boolean =>
  game.story.variablesState.reactiveDepsEnabled === true;

describe("reactive dependency tracking survives story-state replacement", () => {
  test("layout mount enables it (baseline)", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    expect(depsEnabled(h.game)).toBe(true);
  });

  test("rewindStory (the STOP → PLAY restart path) re-asserts it", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    (h.game as any).rewindStory();
    expect(depsEnabled(h.game)).toBe(true);
  });

  test("updateProgram (the live-edit recompile path) re-asserts it", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const { program } = compileUI(SOURCE);
    (h.game as any).updateProgram(program);
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

  test("Story.ResetState itself carries the tracking mode (the choke point)", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    (h.game as any).story.ResetState();
    expect(depsEnabled(h.game)).toBe(true);
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

  test("restore matches what mount decided (no layouts → no independent opt-in)", async () => {
    const h = createHarness(`-> start\nscene start\n  Hello.\nend\n`);
    await h.ready;
    const atMount = depsEnabled(h.game);
    (h.game as any).rewindStory();
    expect(depsEnabled(h.game)).toBe(atMount);
  });
});
