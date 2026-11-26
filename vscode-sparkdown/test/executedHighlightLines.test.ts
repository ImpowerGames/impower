import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import {
  MAIN_URI,
  previewFixture,
  previewReports,
  runningReports,
  story,
  type ExecutedReport,
  type Story,
} from "@impower/spark-engine/test/core/executedReportHarness";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { isExecutionGapLine } from "@impower/sparkdown/src/compiler/utils/isExecutionGapLine";
import { describe, expect, it } from "vitest";
import { addExecutedHighlightLines } from "../src/utils/executedHighlightLines";

const gapReader = (s: Story) => {
  const documents = new SparkdownDocumentRegistry([]);
  documents.add({
    textDocument: {
      uri: MAIN_URI,
      languageId: "sparkdown",
      version: 1,
      text: s.source,
    },
  });
  const tree = documents.tree(MAIN_URI)!;
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of s.lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  return (line: number) =>
    isExecutionGapLine(() => tree, lineStarts[line]!, s.lines[line] ?? "");
};

const highlightedFromLocations = (
  locations: DocumentLocation[],
  isGap: (line: number) => boolean,
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
        if (isGap(i)) {
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
  const isGap = gapReader(s);
  const lines = new Set<number>();
  const executed = report.params.executedLines?.[MAIN_URI];
  if (executed) {
    addExecutedHighlightLines(lines, executed.ranges, isGap);
  }
  return {
    reported: [...lines].sort((a, b) => a - b),
    expected: highlightedFromLocations(
      report.lineLocations.filter((l) => l.uri === MAIN_URI),
      isGap,
    ),
  };
};

const BLOCK_COMMENT_GAP = `scene A
  Line one.
  /* a note
  across lines */
  Line two.
  Line three. /* trailing
  still the note */
  Line four.
  done
end
`;

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

const BLOCK_THEN_BLANK = `scene A
  Line one.
  if true then
    Line two.
  end

  Line three.
  done
end
`;

const INTERROGATION = `store trust = 0
store clues = 0

scene interrogation
  INSPECTOR:
    Where were you at nine?
  choose
    * [Tell the truth.]
      trust += 2
    * [Show the photograph.]
      trust += 5
    * [Lie.]
      trust -= 1
  end
  if trust > 3 then
    INSPECTOR:
      I believe you.
    for i = 1, 40000 do
      clues += 1
    end
    You found {clues} clues.
  end
end
`;

describe("the executed line highlight", { timeout: 60_000 }, () => {
  it("leaves a gap at the options the route did not take and runs across a speaker cue and a block's end", async () => {
    const s = story(INTERROGATION);
    const [report] = await previewReports(s, 20);
    const { reported } = highlighted(s, report!);
    expect(reported).toEqual([5, 6, 9, 10, 14, 15, 16, 17, 18, 19, 20]);
  });

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
    expect(reported).toEqual(expect.arrayContaining([6, 7, 8, 9]));
    expect(reported).toEqual(expected);
  });

  it("marks the same lines when a blank line follows a block", async () => {
    const s = story(BLOCK_THEN_BLANK);
    for (const line of [3, 6]) {
      const [report] = await previewReports(s, line);
      const { reported, expected } = highlighted(s, report!);
      expect(reported).toEqual(expected);
    }
  });

  it("marks the lines of a block comment between two executed lines", async () => {
    const s = story(BLOCK_COMMENT_GAP);
    const [report] = await previewReports(s, 7);
    const { reported, expected } = highlighted(s, report!);
    expect(reported).toEqual(expect.arrayContaining([1, 2, 3, 4, 5, 6, 7]));
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
