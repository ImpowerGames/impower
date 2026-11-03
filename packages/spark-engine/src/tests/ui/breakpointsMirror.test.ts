import { describe, expect, test } from "vitest";
import { uiBuiltinDefinitions } from "../../game/modules/ui/uiBuiltinDefinitions";
import { createHarness } from "./harness/uiTestHarness";

const SOURCE = "\n-> start\n\nscene start\n  A line.\nend\n";

describe("the engine's breakpoint mirror", () => {
  test("matches the prelude's `config.ui.breakpoints`", async () => {
    const h = createHarness(SOURCE, 0);
    await h.ready;
    const runtime = (h.game.context as any)?.config?.ui?.breakpoints;
    const authored = Object.fromEntries(
      Object.entries(runtime ?? {}).filter(([k]) => !k.startsWith("$")),
    );
    expect(authored).toEqual(uiBuiltinDefinitions().config.ui.breakpoints);
  });
});
