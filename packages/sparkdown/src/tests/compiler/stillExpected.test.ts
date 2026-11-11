import { describe, expect, test } from "vitest";
import { stillExpected } from "../../compiler/utils/closeMatch";
import { STILL_EXPECTED_CASES, caseRange } from "./stillExpectedCases";

describe("stillExpected", () => {
  test.each(STILL_EXPECTED_CASES.map((c) => [c.label, c] as const))(
    "%s",
    (_, testCase) => {
      const { from, to } = caseRange(testCase);
      expect(
        stillExpected(testCase.after, from, to, testCase.expect, testCase.kind),
      ).toBe(testCase.still);
    },
  );

  test("refuses a range past the end of the text", () => {
    expect(stillExpected("show al", 5, 10, "alcie", "name")).toBe(false);
  });
});
