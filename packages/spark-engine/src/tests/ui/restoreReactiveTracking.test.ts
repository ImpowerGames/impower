// Every story-state replacement mints a fresh `VariablesState` whose
// fine-grained reactive dependency tracking defaults OFF, and layout mount
// (`constructLayoutsFromAst`) — the one place that enables it — does not
// re-run on those paths, precisely because they preserve the mounted UI.
//
// Two layers of defense, both pinned here:
//   - `Story.ResetState` carries the observation mode onto the fresh state
//     (the CHOKE POINT — it covers every reset caller, present and future).
//   - `Game.restoreReactiveTracking()` re-asserts it after the replacements
//     that don't go through ResetState (a recompile's `new Story`, a
//     checkpoint `LoadJson`).
//
// Without these, a mounted `{binding}` froze for the whole run whenever ANY
// reset happened after mount: handlers fired and the VM updated, but no
// change was ever recorded for `refreshLayouts` to react to, so the DOM
// never moved (#365 — the editor's PLAY takes rewindStory + jumpToPath, TWO
// resets, and the second one was uncovered).

import { describe, expect, test } from "vitest";
import { compileUI, createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SOURCE = `store hp = 100

function hit()
  hp = hp - 10
end

layout main with
  column:
    text "HP: {hp}"
    button "Hit" @click=hit
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
    // `preview()` short-circuits when asked for the path it already previewed
    // — correct while the story is unchanged, wrong across a recompile: an
    // intra-line edit keeps the structural path while changing the text, so
    // the memo must clear or the fresh story never re-runs and the reconcile
    // sweep blanks the preview (found live in the final #308 review).
    const h = createHarness(SOURCE);
    await h.ready;
    h.preview();
    expect((h.game as any).context.system.previewing).toBeTruthy();
    const { program } = compileUI(SOURCE);
    (h.game as any).updateProgram(program);
    expect((h.game as any).context.system.previewing).toBeUndefined();
  });

  test("Story.ResetState itself carries the tracking mode (the choke point)", async () => {
    // Every reset path mints a fresh VariablesState — `rewindStory`,
    // `jumpToPath`, and any future caller. Per-call-site re-assertion is
    // whack-a-mole (jumpToPath's reset was the one that froze the editor's
    // PLAY runs, #365), so the STORY preserves the observation mode across
    // the reset.
    const h = createHarness(SOURCE);
    await h.ready;
    (h.game as any).story.ResetState();
    expect(depsEnabled(h.game)).toBe(true);
  });

  test("the full PLAY fail-branch flow keeps tracking and paints a clicked refresh", async () => {
    // The editor's PLAY: mount at connect, `start()` with simulation "fail"
    // → rewindStory → jumpToPath (a SECOND ResetState) → continue. Then a
    // renderer click round-trips as an EventMessage. Pre-fix, the second
    // reset silently disabled tracking: the handler ran, `hp` changed in
    // the VM, and no ui/update was ever emitted — the alternating "dead
    // run" #365 was filed on, reproduced headlessly.
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
    // The fail branch's rewind + jump write the globals back to their
    // defaults while the mounted bindings still hold the abandoned run's
    // paints. `onStart` marks the first refresh force-all, so the beat
    // boundary right after start repaints the reset state.
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
    // On a PLAY that reuses the game, `connect` re-mounts layouts while
    // `system.simulating` is still set from the route simulation: the mount
    // records each entry's freshly evaluated value in its equality memo
    // (`last`) while every paint is suppressed, so the renderer keeps the
    // abandoned run's pixels. The post-start force-all refresh must repaint
    // even when the memo says nothing changed — otherwise the DOM stays
    // stale for the whole run (#365's live restart face: HP stuck at the
    // old value while the VM ran fine underneath).
    const h = createHarness(SOURCE);
    await h.ready;
    const buttonId = h.observedElementIds()[0]!;
    h.reset();
    h.emitEvent("click", buttonId);
    await flushMicrotasks(10);
    expect(JSON.stringify(h.messages)).toContain("HP: 90");

    // The memo now reads "HP: 90". A plain refresh would paint nothing; the
    // start-marked one must re-emit it.
    h.reset();
    const ui = h.game.module.ui as any;
    ui.onStart();
    ui.refreshLayouts();
    expect(JSON.stringify(h.messages)).toContain("HP: 90");
  });

  test("no reactive refresh runs while the route simulation is active", async () => {
    // Simulation replays beats on THIS game with renderer paints suppressed;
    // letting refreshLayouts run there either paints mid-simulation or —
    // worse — silently advances the equality memos with no paint, wedging
    // the gate for the real run. The changes must survive untouched for the
    // first post-start refresh.
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
    // `restoreReactiveTracking` must never make a DIFFERENT enablement
    // decision than layout mount did: whatever state connect left the flag
    // in, a rewind reproduces it. (A compiled program always carries the
    // `sparkle` channel — even with no authored layout — so mount itself
    // decides via the same `program.sparkle.layouts` presence check.)
    const h = createHarness(`-> start\nscene start\n  Hello.\nend\n`);
    await h.ready;
    const atMount = depsEnabled(h.game);
    (h.game as any).rewindStory();
    expect(depsEnabled(h.game)).toBe(atMount);
  });
});
