import { describe, expect, it } from "vitest";
import { createDebugGame } from "./dapTestHarness";

// Phase 1 — global categorization + live defines.
//
// A `define` registers a live __def table in the runtime globals. Two bugs were
// fixed here: (1) the Vars scope dumped that define table (and would dump
// closure/stdlib tables) alongside author variables; (2) the Defines scope read
// the compile-time program.context (LSP-only) instead of the live __def tables,
// so it never reflected the actual runtime defines.
describe("DAP engine debug core — define categorization", () => {
  const source = [
    "store health = 100", // 0
    "define Bird with", //   1
    "  canFly = true", //    2
    "  isFlying = false", // 3
    "  fly()", //            4
    "    self.isFlying = true", // 5
    "  end", //              6
    "end", //                7
    "First beat.", //        8 (breakpoint)
    "{health}", //           9
  ].join("\n");

  it("keeps define tables out of the Vars scope", () => {
    const h = createDebugGame(source);
    h.game.setBreakpoints([{ file: h.uri, line: 8 }]);
    h.game.start();

    const varNames = h.game.getVarVariables().map((v) => v.name);
    expect(varNames).toContain("health");
    expect(varNames).not.toContain("Bird");
  });

  it("surfaces live defines (from __def tables) in the Defines scope", () => {
    const h = createDebugGame(source);
    h.game.setBreakpoints([{ file: h.uri, line: 8 }]);
    h.game.start();

    const bird = h.game.getDefineVariables().find((d) => d.name === "Bird");
    expect(bird).toBeDefined();
    expect(bird!.variablesReference).toBeGreaterThan(0);

    const props = h.game.getChildVariables(bird!.variablesReference);
    expect(props.find((p) => p.name === "canFly")?.value).toBe("true");
    expect(props.find((p) => p.name === "isFlying")?.value).toBe("false");
  });
});
