import { afterEach, expect, it, vi } from "vitest";
import { SparkdownTypechecker } from "../../../compiler/typecheck/SparkdownTypechecker";
import { prepareLuauSource } from "../../luau-conformance/typecheckTestHarness";

afterEach(() => { vi.restoreAllMocks(); });

it("prepares authoritative converter syntax without running the legacy TypeScript solver", () => {
  const checker = vi.spyOn(SparkdownTypechecker.prototype, "checkDocument");
  const good = prepareLuauSource("local value: number = 'wrong'");
  expect(good.syntaxDiagnostics).toEqual([]);
  expect(good.unit.root.body.length).toBeGreaterThan(0);
  const narrative = prepareLuauSource("local value = 1\n-> elsewhere");
  expect(narrative.syntaxDiagnostics.some(error => error.line === 1)).toBe(true);
  const malformed = prepareLuauSource("local value = 1 )");
  expect(malformed.syntaxDiagnostics.length).toBeGreaterThan(0);
  expect(checker).not.toHaveBeenCalled();
});

it("preserves raw early-end recovery evidence while publishing the grammar-owned syntax diagnostic", () => {
  const prepared = prepareLuauSource("local x = 1\nend\nlocal y = 2");
  expect(prepared.unit.errors).toHaveLength(1);
  expect(prepared.unit.errors[0]).toMatchObject({ message: "Expected <eof>, got 'end'",
    location: { begin: { line: 1, column: 0 }, end: { line: 1, column: 3 } } });
  expect(prepared.unit.errors[0]?.malformed).toBeUndefined();
  expect(prepared.syntaxDiagnostics).toEqual([{ line: 2, column: 0, endLine: 2, endColumn: 11,
    message: 'Sparkdown ended the snippet\'s function before "local y = 2"', code: "SyntaxError" }]);
  const malformed = prepareLuauSource("\n\n    local x = 1 )\n");
  expect(malformed.unit.errors[0]?.malformed).toBeDefined();
  expect(malformed.syntaxDiagnostics[0]).toMatchObject({ line: 2, column: 16,
    message: "Expected identifier when parsing expression, got ')'" });
});
