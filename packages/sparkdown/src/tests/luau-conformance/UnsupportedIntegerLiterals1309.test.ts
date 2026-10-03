// #1309 deliberately rejects Luau's native 64-bit integers. Syntax recognition
// in the upstream checker does not supply integer values or an integer library.
import { beforeAll, describe, expect, test } from "vitest";
import { diagnose, diagnoseDetailed, diagnoseInFunction } from "./diagnosticTestHarness";
import { loadOfficialLuau } from "../compiler/officialLuau";
import { KNOWN_DISAGREEMENTS } from "../compiler/luauFixtures";

const UNSUPPORTED = "Luau 64-bit integer literals are not supported in Sparkdown";
const ZERO_DIGIT_HEX = ["0xi", "0x_i", "0x__i", "0Xi", "0X_i", "0_x_i", "0__x__i__", "-0xi"];

describe("unsupported Luau integer literals (#1309)", () => {
  let official: Awaited<ReturnType<typeof loadOfficialLuau>>;
  beforeAll(async () => {
    official = await loadOfficialLuau();
  });

  test("only the two integer fixtures are deliberate documented oracle limitations", () => {
    const integerEntries = KNOWN_DISAGREEMENTS.filter((entry) => entry.issue === 1309);
    expect(integerEntries.map((entry) => entry.fixture)).toEqual([
      "conformance/integers.luau", "conformance/integers_regspill.luau",
    ]);
    // The cast keeps the assertion executable on the pre-classification base.
    const limitations = KNOWN_DISAGREEMENTS.filter((entry) =>
      (entry as { limitation?: unknown }).limitation !== undefined,
    );
    expect(limitations.map((entry) => entry.fixture)).toEqual(integerEntries.map((entry) => entry.fixture));
    for (const entry of integerEntries) {
      expect((entry as { limitation?: unknown }).limitation).toEqual({
        diagnostic: UNSUPPORTED,
        documentation: "docs/runtime/DIVERGENCES.md#luaus-native-64-bit-integers-are-unsupported",
      });
    }
  });

  test.each([
    "0i", "123i", "-5i", "0xABi", "0Xffi", "0b101i", "0B1i",
    "12_34i", "0_x_AB_i", "0b1_0i", "123i_",
    "9223372036854775807i", "0xFFFFFFFFFFFFFFFFi",
    ...ZERO_DIGIT_HEX,
  ])("%s is valid in Luau and explicitly unsupported here", (literal) => {
    const body = `return ${literal}`;
    expect(official(body).errors).toBe(0);
    const diagnostics = diagnoseInFunction(body);
    expect(diagnostics).toContain(UNSUPPORTED);
    expect(diagnostics).not.toContain("Malformed number");
  });

  test.each([
    "99999999999999999999i", "0xFFFFFFFFFFFFFFFFFFi",
  ])("%s is rejected without pretending to provide integer overflow semantics", (literal) => {
    expect(diagnoseInFunction(`return ${literal}`)).toContain(UNSUPPORTED);
  });

  test("the error range includes the complete literal", () => {
    const literal = "0xFFFF_FFFF_FFFF_FFFFi";
    const diagnostics = diagnoseDetailed(`function f()\n  return ${literal}\nend\n`);
    const found = diagnostics.filter((d) => d.message === UNSUPPORTED);
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe(1);
    expect(found[0]?.range).toEqual({
      start: { line: 1, character: 9 },
      end: { line: 1, character: 9 + literal.length },
    });
  });

  test.each(ZERO_DIGIT_HEX)("%s has a complete unsupported-literal range", (literal) => {
    const found = diagnoseDetailed(`function f()\n  return ${literal}\nend\n`)
      .filter((d) => d.message === UNSUPPORTED);
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe(1);
    expect(found[0]?.range).toEqual({
      start: { line: 1, character: 9 + Number(literal.startsWith("-")) },
      end: { line: 1, character: 9 + literal.length },
    });
  });

  test.each([
    ["local initializer", "function f()\n  local x = 123i\n  return x\nend\n"],
    ["call argument", "function f()\n  return integer.div(5i, 2i)\nend\n"],
    ["define field", "define my_thing with\n  value = 123i\nend\n"],
    ["config field", "config my_config with\n  value = 123i\nend\n"],
    ["flow statement", "scene A\n  & local x = 123i\nend\n"],
  ])("%s reports the unsupported literal", (_context, source) => {
    expect(diagnose(source)).toContain(UNSUPPORTED);
  });

  test.each(["1.2.3", "0xg", "0b123", "123ii", "0xABii", "1.5i", "1e3i", "123ix"])(
    "%s keeps its malformed-number error",
    (literal) => {
      const diagnostics = diagnoseInFunction(`return ${literal}`);
      expect(diagnostics).toContain("Malformed number");
      expect(diagnostics).not.toContain(UNSUPPORTED);
    },
  );

  test.each([
    "0bi", "0b_i", "0b__i", "0Bi", "0B_i", "0_b_i",
    "0x", "0x_", "0X__", "0b", "0b_", "0B__",
    "0xii", "0x_i_i", "0xI", "0xj", "0xgi", "0x.i", "0bii", "0b2i", "0bI",
  ])("%s is rejected by official Luau and retains its malformed-number diagnostic", (literal) => {
    expect(official(`return ${literal}`).errors).toBeGreaterThan(0);
    const diagnostics = diagnoseInFunction(`return ${literal}`);
    expect(diagnostics).toContain("Malformed number");
    expect(diagnostics).not.toContain(UNSUPPORTED);
  });

  test.each(["0", "123", "-5", "1.5", "1e3", "0xAB", "0b101", "12_34"])(
    "%s remains an ordinary number",
    (literal) => {
      expect(diagnoseInFunction(`return ${literal}`)).toEqual([]);
    },
  );

  test.each([
    "The code example uses 123i.\n",
    "style my_style with\n  padding = 8i\nend\n",
    "theme my_theme with\n  gap = 1i\nend\n",
    "Hello <1i:there> friend.\n",
    "function f()\n  return '123i'\nend\n",
    "function f()\n  -- 123i\n  return 123\nend\n",
  ])("does not diagnose integer-like text outside Luau numbers: %s", (source) => {
    expect(diagnose(source)).not.toContain(UNSUPPORTED);
  });
});
