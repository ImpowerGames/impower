import { describe, expect, test } from "vitest";
import { createHarness, MAIN_URI } from "../ui/harness/uiTestHarness";

const runtimeErrors = (messages: any[]) =>
  messages
    .filter((m) => m.method === "game/runtimeError")
    .map((m) => String(m.params.message));

const writtenText = (harness: any): string =>
  harness
    .snapshotFiltered("ui/write-text")
    .map((m: any) =>
      (m?.params?.instructions ?? []).map((i: any) => i.text ?? "").join(""),
    )
    .join("");

const LIMITS = { steps: 5_000, depth: 50 };

type Limits = typeof LIMITS;

const applyLimits = (game: any, limits: Limits) => {
  game._executionStepLimit = limits.steps;
  game._callDepthLimit = limits.depth;
};

const previewOf = async (source: string, line: number, limits?: Limits) => {
  const h = createHarness(source, line);
  await h.ready;
  h.reset();
  const game = h.game as any;
  if (limits) {
    applyLimits(game, limits);
  }
  const started = performance.now();
  await h.preview(line);
  return {
    ms: performance.now() - started,
    errors: runtimeErrors(h.messages),
    text: writtenText(h),
    advancesUsed: game._executionStepLimit - game._executionStepsRemaining,
  };
};

const DANGLING_ACCESS = [
  "function f()",
  "  local t = { a = { b = 7 } }",
  "  local y = t.a.",
  "  return y",
  "end",
  "",
  "scene start",
  "  $:",
  "    A QUIET ROOM",
  "",
  "  BOB:",
  "    Value {f()}.",
  "end",
  "",
].join("\n");

const SELF_CALL = [
  "function f()",
  "  return f()",
  "end",
  "",
  "scene start",
  "  BOB:",
  "    Value {f()}.",
  "end",
  "",
].join("\n");

const DISPLAY_SELF_CALL = [
  "function f()",
  '  display("Again.")',
  "  return f()",
  "end",
  "",
  "scene start",
  "  BOB:",
  "    Value {f()}.",
  "end",
  "",
].join("\n");

describe("a preview of a dangling access (#1079)", () => {
  test("shows the line below the function without recursing", async () => {
    const result = await previewOf(DANGLING_ACCESS, 11, LIMITS);
    expect(result.errors.join("\n")).not.toContain("stack overflow");
    expect(result.text).toContain("Value");
  }, 120_000);
});

describe("a preview that recurses without end (#1072)", () => {
  test("stops on a stack overflow when each call displays a line", async () => {
    const result = await previewOf(DISPLAY_SELF_CALL, 7, LIMITS);
    expect(result.errors.join("\n")).toContain("stack overflow");
    expect(result.advancesUsed).toBeLessThan(LIMITS.steps);
  }, 120_000);

  test("stops on a stack overflow when a function calls itself unconditionally", async () => {
    const result = await previewOf(SELF_CALL, 6, LIMITS);
    expect(result.errors.join("\n")).toContain("stack overflow");
    expect(result.advancesUsed).toBeLessThan(LIMITS.steps);
  }, 120_000);

  test("reaches the default call depth long before the default step budget", async () => {
    const measured = await previewOf(DISPLAY_SELF_CALL, 7, LIMITS);
    expect(measured.errors.join("\n")).toContain("stack overflow");
    const perCall = measured.advancesUsed / LIMITS.depth;
    expect(perCall).toBeGreaterThan(1);
    const h = createHarness("scene start\n  Hello.\nend\n", 1);
    await h.ready;
    const game = h.game as any;
    expect(perCall * game._callDepthLimit).toBeLessThan(
      game._executionStepLimit / 4,
    );
  }, 120_000);
});

describe("PLAY that recurses without end (#1072)", () => {
  test("stops on a stack overflow and does not report the story finished", async () => {
    const h = createHarness(SELF_CALL, 0);
    await h.ready;
    h.reset();
    const game = h.game as any;
    applyLimits(game, LIMITS);
    game.setStartFrom({ file: MAIN_URI, line: 0 }, "first");
    game.start();
    expect(runtimeErrors(h.messages).join("\n")).toContain("stack overflow");
    expect(h.messages.map((m) => m.method)).not.toContain("game/finished");
  }, 120_000);
});

describe("a preview through deep recursion that ends (#1072)", () => {
  test("shows the value of a 4,000-deep recursion in under twenty seconds", async () => {
    const source = [
      "function count(n)",
      "  if n == 0 then",
      "    return 0",
      "  end",
      "  return 1 + count(n - 1)",
      "end",
      "",
      "scene start",
      "  BOB:",
      "    Value {count(4000)}.",
      "end",
      "",
    ].join("\n");
    const result = await previewOf(source, 9);
    expect(result.errors).toEqual([]);
    expect(result.text).toContain("Value 4000.");
    expect(result.ms).toBeLessThan(20_000);
  }, 180_000);
});
