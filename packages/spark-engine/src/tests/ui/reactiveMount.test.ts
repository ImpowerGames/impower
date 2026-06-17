// Phase 3 I1: the reactive (AST-driven) render path mounts screens from
// program.sparkle.screens. This increment is a *static* mount — it must
// reproduce the legacy constructScreen element tree byte-for-byte so the
// engine→consumer message stream is unchanged when the flag flips. We prove
// that by building the SAME source through both paths and asserting the streams
// are identical (ids normalized in first-seen order, so identical creation
// order ⇒ identical ids).

import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

// Mirrors the static golden's fixture (screen.test.ts): a screen that overrides
// the builtin `main`, plus the builtin `loading` screen (which the prelude now
// also contributes to program.sparkle, so the AST path renders it too).
const SCREEN = `screen main with
  stage:
    backdrop:
      image
    portrait:
      mask shadow_1
      image
  textbox:
    character_info:
      character_name:
        text
      character_parenthetical:
        text
    dialogue:
      stroke
      text
    continue_indicator
end
`;

describe("reactive mount (Phase 3 I1)", () => {
  test("AST-driven static mount matches the static constructScreen stream", async () => {
    const staticH = createHarness(SCREEN);
    const reactiveH = createHarness(SCREEN, 0, { reactive: true });
    await Promise.all([staticH.ready, reactiveH.ready]);
    // Whole connect-time stream (styles + screen tree + theme + transient
    // clears) must be byte-identical between the two render paths.
    expect(reactiveH.snapshotFiltered("ui/")).toEqual(
      staticH.snapshotFiltered("ui/"),
    );
  });

  test("the builtin `loading` screen is mounted from the prelude AST", async () => {
    const reactiveH = createHarness(SCREEN, 0, { reactive: true });
    await reactiveH.ready;
    const created = reactiveH
      .snapshotFiltered("ui/create")
      .map((m: any) => m.params?.name);
    // loading + its children come from the builtins prelude's sparkle channel.
    expect(created).toContain("loading");
    expect(created).toContain("loading_bar");
    expect(created).toContain("loading_fill");
    // the authored screen overrides the builtin `main` in place.
    expect(created).toContain("main");
    expect(created).toContain("mask shadow_1");
  });
});
