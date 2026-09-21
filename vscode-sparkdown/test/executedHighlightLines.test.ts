// The lines the extension highlights for what a game executed (#714): drawn
// from the report's merged line ranges, they are the lines it highlighted when
// the report listed every executed location, for a preview at the bottom of a
// long scene, a preview in another scene and a running game.
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import {
  MAIN_URI,
  previewFixture,
  previewReports,
  runningReports,
  story,
  type ExecutedReport,
  type Story,
} from "@impower/spark-engine/src/tests/core/executedReportHarness";
import { describe, expect, it } from "vitest";
import { addExecutedHighlightLines } from "../src/utils/executedHighlightLines";

/** What the extension highlighted from a report that listed every location:
 *  each location's lines, sorted by start, and the lines between two of them
 *  when every one is blank or a comment. */
const highlightedFromLocations = (
  locations: DocumentLocation[],
  lineText: (line: number) => string,
) => {
  const lines = new Set<number>();
  const sorted = [...locations].sort(
    (a, b) => a.range.start.line - b.range.start.line,
  );
  let prevEndLine: number | undefined;
  for (const location of sorted) {
    if (prevEndLine != null) {
      const blank = new Set<number>();
      for (let i = prevEndLine + 1; i < location.range.start.line; i++) {
        const trimmed = lineText(i).trim();
        if (!trimmed || trimmed.startsWith("//")) {
          blank.add(i);
        } else {
          blank.clear();
          break;
        }
      }
      for (const i of blank) {
        lines.add(i);
      }
    }
    for (let i = location.range.start.line; i <= location.range.end.line; i++) {
      lines.add(i);
    }
    prevEndLine = location.range.end.line;
  }
  return [...lines].sort((a, b) => a - b);
};

const highlighted = (s: Story, report: ExecutedReport) => {
  const lineText = (line: number) => s.lines[line] ?? "";
  const lines = new Set<number>();
  const executed = report.params.executedLines?.[MAIN_URI];
  if (executed) {
    addExecutedHighlightLines(lines, executed.ranges, lineText);
  }
  return {
    reported: [...lines].sort((a, b) => a - b),
    expected: highlightedFromLocations(
      report.locations.filter((l) => l.uri === MAIN_URI),
      lineText,
    ),
  };
};

const TWO_SCENES = `scene A
  Line one.
  -> B
end

scene B
  Line two.

  // a comment between two lines
  Line three.
  if true then
    Line four.
  end
  Line five.
  done
end
`;

// Compiling the fixture and replaying its route takes seconds.
describe("the executed line highlight", { timeout: 60_000 }, () => {
  it("marks the same lines for a preview at the bottom of a long scene", async () => {
    const fixture = previewFixture();
    const [report] = await previewReports(fixture, fixture.line);
    const { reported, expected } = highlighted(fixture, report!);
    expect(reported.length).toBeGreaterThan(1000);
    expect(reported).toEqual(expected);
  });

  it("marks the same lines for a preview in another scene", async () => {
    const s = story(TWO_SCENES);
    const [report] = await previewReports(s, 9);
    const { reported, expected } = highlighted(s, report!);
    // The blank line and the comment between `Line two.` and `Line three.`.
    expect(reported).toEqual(expect.arrayContaining([6, 7, 8, 9]));
    expect(reported).toEqual(expected);
  });

  it("marks the same lines while a game runs", async () => {
    const s = story(TWO_SCENES);
    const reports = await runningReports(s, 0);
    expect(reports.length).toBeGreaterThan(0);
    for (const report of reports) {
      const { reported, expected } = highlighted(s, report);
      expect(reported).toEqual(expected);
    }
  });
});
