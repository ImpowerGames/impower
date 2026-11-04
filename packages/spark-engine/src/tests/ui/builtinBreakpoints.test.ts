import { describe, expect, test } from "vitest";
import builtinBreakpoints from "../../game/modules/ui/builtinBreakpoints.json";
import { preludeContext } from "../harness/compilePrelude";
import { createHarness } from "./harness/uiTestHarness";

const authored = (record: unknown) =>
  Object.fromEntries(
    Object.entries(record ?? {}).filter(([k]) => !k.startsWith("$")),
  );

const SOURCE = "\n-> start\n\nscene start\n  A line.\nend\n";

describe("the builtin breakpoint table", () => {
  test("is the compiled prelude's `config.ui.breakpoints`", async () => {
    const prelude = authored((preludeContext()["config"] as any)?.ui?.breakpoints);
    expect(Object.keys(prelude)).not.toHaveLength(0);
    await expect(`${JSON.stringify(prelude, null, 2)}\n`).toMatchFileSnapshot(
      "../../game/modules/ui/builtinBreakpoints.json",
    );
    expect(builtinBreakpoints).toEqual(prelude);
  });

  test("is what a running game's context carries", async () => {
    const h = createHarness(SOURCE, 0);
    await h.ready;
    const runtime = (h.game.context as any)?.config?.ui?.breakpoints;
    expect(authored(runtime)).toEqual(builtinBreakpoints);
  });
});
