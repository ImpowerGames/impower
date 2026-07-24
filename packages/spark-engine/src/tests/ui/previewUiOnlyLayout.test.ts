import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

// A UI-only screen (no narrative flow) has, as its only path-located flows, the
// synthetic `__binding_<offset>` evaluators the compiler hoists for
// `{interpolations}` and `@event` handlers. `preview(file, line)` DIVERTS to the
// closest path (`ChoosePathString`); if that resolves to a binding FUNCTION, the
// story runs the function's `return` outside a call context — the ink runtime
// error "Found function return statement (return), when expected end of flow" —
// and the screen never mounts.
//
// Regression: findClosestPath must exclude `__binding_*` paths from preview
// candidates. Reproduced only via the preview mount path (`game.preview`), not
// the connect path (the earlier harness default), which is why it slipped past.
describe("preview a UI-only reactive layout emits no ink flow error", () => {
  const previewClean = async (label: string, src: string) => {
    const errs: string[] = [];
    const h = createHarness(src);
    (h.game.story as any).onError = (m: string) => errs.push(m);
    await h.ready;
    h.preview(0);
    expect(errs, `${label} produced ink errors`).toEqual([]);
  };

  test("interpolation prop binding", async () => {
    await previewClean(
      "prop",
      `store email = ""\nlayout main with\n  field #value={email}\nend\n`,
    );
  });

  test("inline @event handler closure", async () => {
    await previewClean(
      "handler",
      `store email = ""\nlayout main with\n  field #value={email} @input={ email = event.value }\nend\n`,
    );
  });

  test("text interpolation in a nested column", async () => {
    await previewClean(
      "text",
      `store hp = 5\nlayout main with\n  column #child-gap=8:\n    text "HP: {hp}"\n    button "Go"\nend\n`,
    );
  });
});
