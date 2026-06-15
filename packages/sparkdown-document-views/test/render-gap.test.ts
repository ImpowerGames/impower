import { describe, expect, it } from "vitest";
import { renderPreview } from "./helpers/renderPreview";

describe("rendered preview — gap bug", () => {
  it("detective mackenzie gap (image directive followed by dialogue)", () => {
    const source =
      "She folds it away.\n\n" +
      "DETECTIVE MACKENZIE:\n" +
      "  [[mackenzie_apathetic]] // [[todo_mackenzie_sigh]]\n" +
      "  Stay out of trouble.\n\n" +
      "Raffles blinks.\n";
    const r = renderPreview(source);
    const offending = r.lines.filter((l) => l.emptyButBlockRendered);
    // Expectation: the directive line should not render as an empty-but-block
    // line. Once we fix the formatter, this assertion passes.
    expect(offending.map((l) => l.index)).toEqual([]);
  });
});
