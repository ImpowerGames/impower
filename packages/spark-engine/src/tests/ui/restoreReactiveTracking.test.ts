// Every story-state replacement mints a fresh `VariablesState` whose
// fine-grained reactive dependency tracking defaults OFF, and layout mount
// (`constructLayoutsFromAst`) — the one place that enables it — does not
// re-run on those paths, precisely because they preserve the mounted UI.
// `Game.restoreReactiveTracking()` re-asserts the flag after each of them.
//
// Without this, every mounted `{binding}` froze after a STOP → PLAY restart
// or a live-edit recompile: handlers fired and the VM updated, but no change
// was ever recorded for `refreshLayouts` to react to, so the DOM never moved
// (found by the final #308 review; reproduced and re-verified in the live
// editor).

import { describe, expect, test } from "vitest";
import { compileUI, createHarness } from "./harness/uiTestHarness";

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
