import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { formatRender, renderPreview } from "./helpers/renderPreview";

const SNAP_DIR = resolve(__dirname, "snapshots");

const dump = (name: string, source: string) => {
  const r = renderPreview(source);
  mkdirSync(SNAP_DIR, { recursive: true });
  writeFileSync(
    resolve(SNAP_DIR, `${name}.txt`),
    `## source\n${source}\n## render\n${formatRender(r)}\n`,
    "utf8",
  );
  return r;
};

describe("rendered preview — gap bug", () => {
  it("detective mackenzie gap (image directive followed by dialogue)", () => {
    const source =
      "She folds it away.\n\n" +
      "DETECTIVE MACKENZIE:\n" +
      "  [[mackenzie_apathetic]] // [[todo_mackenzie_sigh]]\n" +
      "  Stay out of trouble.\n\n" +
      "Raffles blinks.\n";
    const r = dump("mackenzie-gap", source);
    const offending = r.lines.filter((l) => l.emptyButBlockRendered);
    // Expectation: the directive line should not render as an empty-but-block
    // line. Once we fix the formatter, this assertion passes.
    expect(offending.map((l) => l.index)).toEqual([]);
  });
});
