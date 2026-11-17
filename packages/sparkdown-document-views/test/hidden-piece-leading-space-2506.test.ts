import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";

const rowsOf = (source: string) =>
  new ScreenplayParser()
    .parse(source)
    .map((token) => ({ tag: token.tag, text: token.text, styled: token.styled }))
    .filter((row) => row.text);

describe("a line that starts with a hidden piece", () => {
  it("prints its text from the margin", () => {
    const rows = rowsOf(
      `scene zz_verify_error\n  Before the verify error.\n  {error("verify boom")} After the error call.\n  Never reached.\nend\n`,
    );
    const row = rows.find((r) => r.text?.includes("After the error call."));
    expect(row?.text).toMatch(/(^|\n)After the error call\./);
    expect(row?.styled).toMatch(/(^|\n)After the error call\./);
  });

  it("prints dialogue text after a hidden piece from the margin", () => {
    const rows = rowsOf(`HERO:\n  {error("boom")} After the call.\n`);
    const row = rows.find((r) => r.text?.includes("After the call."));
    expect(row?.text).toBe("After the call.");
    expect(row?.styled).toBe("After the call.");
  });

  it("keeps the spaces around a piece inside the line", () => {
    const rows = rowsOf(`Before {error("boom")} after.\n`);
    const row = rows.find((r) => r.text?.includes("after."));
    expect(row?.text).toContain(`Before {error("boom")} after.`);
  });
});
