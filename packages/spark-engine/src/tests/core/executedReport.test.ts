// What a game reports it executed (`game/executed`, #714). After a preview the
// executed paths are the whole route the preview replayed, thousands of them
// at the bottom of a long scene; the report carries the lines they cover, as
// ranges per script, and the first and last location, which is what its hosts
// draw, so its size follows the shape of the scene and not the length of the
// route. A displayed suggestion's report is never passed to the editors, and
// carries only what labels the preview.
import { describe, expect, it } from "vitest";
import type { ExecutedReport } from "./executedReportHarness";
import {
  MAIN_URI,
  previewFixture,
  previewReports,
  reportSizes,
  runningReports,
  story,
} from "./executedReportHarness";
import { expandLineRanges } from "../../game/core/utils/executedLineRanges";

/** What the web editor highlights: each script's executed lines, and the
 *  line it follows while a game runs. From the report as it is, and as the
 *  editor derived them from a report that listed every location. */
const highlights = (report: ExecutedReport) => {
  const listed: Record<string, Set<number>> = {};
  for (const l of report.locations) {
    listed[l.uri] ??= new Set();
    for (let i = l.range.start.line; i <= l.range.end.line; i++) {
      listed[l.uri]!.add(i);
    }
  }
  const reported = Object.fromEntries(
    Object.entries(report.params.executedLines ?? {}).map(([uri, lines]) => [
      uri,
      { lines: expandLineRanges(lines.ranges), last: lines.last },
    ]),
  );
  const expected = Object.fromEntries(
    Object.entries(listed).map(([uri, set]) => [
      uri,
      { lines: [...set].sort((a, b) => a - b), last: [...set].at(-1) },
    ]),
  );
  return { reported, expected };
};

/** The report's labels, and what the player and the compilation view read
 *  from a report that listed every location and path. */
const labels = (report: ExecutedReport) => ({
  reported: {
    first: report.params.firstLocation,
    last: report.params.lastLocation,
    lastExecutedPath: report.params.lastExecutedPath,
  },
  expected: {
    first: report.locations[0],
    last: report.locations.at(-1),
    lastExecutedPath: report.paths.at(-1),
  },
});

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
const FUNCTION_CALL = `function F()
  return "world"
end
Hello {F()}.
Bye.
`;

describe("the executed report", { timeout: 60_000 }, () => {
  it("is small after a preview at the bottom of a long scene, and highlights and labels what the listed report did", async () => {
    const fixture = previewFixture();
    const reports = await previewReports(fixture, fixture.line);
    expect(reports).toHaveLength(1);
    const report = reports[0]!;
    // The route replayed thousands of paths.
    expect(report.paths.length).toBeGreaterThan(2000);
    const { reported, expected } = highlights(report);
    expect(reported).toEqual(expected);
    expect(reported[MAIN_URI]!.lines).toContain(fixture.line);
    const l = labels(report);
    expect(l.reported).toEqual(l.expected);
    // Under 1% of what listing every path and location took, as the Raffles
    // and Bunny report is to go from 1.86 MB to under 20 KB.
    const { bytes, listedBytes } = reportSizes(report);
    expect(listedBytes).toBeGreaterThan(500_000);
    expect(bytes).toBeLessThan(listedBytes / 100);
  });

  it("carries only what labels the preview for a displayed suggestion", async () => {
    const fixture = previewFixture();
    const reports = await previewReports(fixture, fixture.line, {
      suggestion: true,
    });
    expect(reports).toHaveLength(1);
    const report = reports[0]!;
    expect(report.params.executedLines).toBeUndefined();
    expect(report.params.lastExecutedPath).toBeUndefined();
    expect(report.params.conditions).toEqual([]);
    const l = labels(report);
    expect(l.reported.first).toEqual(l.expected.first);
    expect(l.reported.last).toEqual(l.expected.last);
    expect(reportSizes(report).bytes).toBeLessThan(5 * 1024);
  });

  it("highlights and labels what the listed report did for a preview scrubbed to another scene", async () => {
    // Line 9 is `Line three.` in scene B.
    const reports = await previewReports(story(TWO_SCENES), 9);
    expect(reports).toHaveLength(1);
    const { reported, expected } = highlights(reports[0]!);
    expect(reported).toEqual(expected);
    expect(reported[MAIN_URI]!.lines).toContain(9);
    const l = labels(reports[0]!);
    expect(l.reported).toEqual(l.expected);
  });

  it("follows the line the listed report did when a line calls a function", async () => {
    // Line 3 runs, then the function's body on line 1, then line 3 again:
    // the line an editor follows is 1, the last one to join the set, and not
    // 3, where the last location ends.
    const reports = await runningReports(story(FUNCTION_CALL), 3);
    expect(reports.length).toBeGreaterThan(0);
    for (const report of reports) {
      const { reported, expected } = highlights(report);
      expect(reported).toEqual(expected);
    }
    expect(
      reports.some((r) => r.params.executedLines?.[MAIN_URI]?.last === 1),
    ).toBe(true);
  });

  it("highlights and labels what the listed report did while a game runs", async () => {
    const reports = await runningReports(story(TWO_SCENES), 0);
    expect(reports.length).toBeGreaterThan(0);
    for (const report of reports) {
      const { reported, expected } = highlights(report);
      expect(reported).toEqual(expected);
      const l = labels(report);
      expect(l.reported).toEqual(l.expected);
      expect(report.params.lastExecutedPath).toBeTruthy();
    }
  });
});
