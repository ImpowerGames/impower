import { describe, expect, it } from "vitest";
import { createDebugGame } from "./dapTestHarness";

// Phase 1 — variable-layer rewrite. Post-luau, table values are ObjectValue
// (a Map<string, AbstractValue>), but the debug renderer used Object.entries/
// Object.keys, which return [] for a Map — so every table rendered as "{}" with
// no children. These tests assert the corrected, expanded output.
describe("DAP engine debug core — table/object variables", () => {
  it("expands a table-valued global into its fields", () => {
    const source = [
      "store inventory = { gold = 10, potions = 3 }", // line 0
      "First beat.", //                                  line 1 (breakpoint)
      "{inventory.gold}", //                             line 2
    ].join("\n");

    const h = createDebugGame(source);
    h.game.setBreakpoints([{ file: h.uri, line: 1 }]);
    h.game.start();
    expect(h.messagesOfMethod("hitBreakpoint").length).toBe(1);

    const inventory = h.game
      .getVarVariables()
      .find((v) => v.name === "inventory");
    expect(inventory).toBeDefined();
    // A structured value must be expandable (non-zero reference + child count).
    expect(inventory!.variablesReference).toBeGreaterThan(0);
    expect(inventory!.namedVariables).toBeGreaterThanOrEqual(2);

    const children = h.game.getChildVariables(inventory!.variablesReference);
    expect(children.find((c) => c.name === "gold")?.value).toBe("10");
    expect(children.find((c) => c.name === "potions")?.value).toBe("3");
  });

  it("expands a nested table recursively", () => {
    const source = [
      "store player = { name = \"Ada\", stats = { hp = 30, mp = 5 } }", // 0
      "First beat.", //                                                    1
      "{player.name}", //                                                  2
    ].join("\n");

    const h = createDebugGame(source);
    h.game.setBreakpoints([{ file: h.uri, line: 1 }]);
    h.game.start();

    const player = h.game.getVarVariables().find((v) => v.name === "player");
    expect(player?.variablesReference).toBeGreaterThan(0);

    const top = h.game.getChildVariables(player!.variablesReference);
    expect(top.find((c) => c.name === "name")?.value).toBe('"Ada"');

    const statsRef = top.find((c) => c.name === "stats")?.variablesReference;
    expect(statsRef).toBeGreaterThan(0);
    const stats = h.game.getChildVariables(statsRef!);
    expect(stats.find((c) => c.name === "hp")?.value).toBe("30");
    expect(stats.find((c) => c.name === "mp")?.value).toBe("5");
  });
});
