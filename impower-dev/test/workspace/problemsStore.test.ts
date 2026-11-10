import { signal } from "@preact/signals";
import { beforeEach, describe, expect, it } from "vitest";
import type { Diagnostic } from "vscode-languageserver-protocol";

const {
  headCount,
  panelRows,
  playedFromRuntimeError,
  problemSummary,
  scopeContext,
  scopedProblems,
  toProblems,
  PLAYED_LIMIT,
} = await import(
  "../../src/modules/spark-editor/workspace/problems/problemEntries"
);
const { default: problems } = await import(
  "../../src/modules/spark-editor/workspace/problems/ProblemsStore"
);

const MAIN = "file://local/main.sd";
const CHAPTER = "file://local/scripts/chapter_1.sd";

const diagnostic = (
  line: number,
  severity: 1 | 2 | 3,
  message = "x",
): Diagnostic => ({
  range: { start: { line, character: 0 }, end: { line, character: 1 } },
  severity,
  message,
});

beforeEach(() => {
  problems.diagnostics.value = {};
  problems.played.value = [];
});

describe("the problems model", () => {
  it("orders Main first, then the other scripts by path, each by line, and splits a title from its message", () => {
    const listed = toProblems({
      [CHAPTER]: [diagnostic(3, 2, "Sound not found")],
      [MAIN]: [diagnostic(5, 1, "Unexpected\nRemove it."), diagnostic(1, 3, "To do: x")],
    });
    expect(
      listed.map((p) => [p.script, p.path, p.line, p.severity, p.title, p.message]),
    ).toEqual([
      ["Main", "main.sd", 2, "info", "To do: x", ""],
      ["Main", "main.sd", 6, "error", "Unexpected", "Remove it."],
      ["chapter_1", "scripts/chapter_1.sd", 4, "warning", "Sound not found", ""],
    ]);
  });

  it("counts problems apart from notes in a card's head and names each kind in a summary", () => {
    const listed = toProblems({
      [MAIN]: [diagnostic(1, 1), diagnostic(2, 2), diagnostic(3, 2), diagnostic(4, 3)],
    });
    expect(headCount(listed)).toEqual({
      text: "(3 problems · 1 note)",
      spoken: "3 problems and 1 note",
    });
    expect(headCount([])).toEqual({ text: "", spoken: "" });
    expect(problemSummary(listed)).toBe("1 error, 2 warnings, 1 note");
  });

  it("lays out both cards, with a heading per script, an end per card and nothing inside a folded card", () => {
    const listed = toProblems({
      [MAIN]: [diagnostic(1, 1)],
      [CHAPTER]: [diagnostic(2, 2)],
    });
    const shown = { error: true, warning: true, info: true };
    expect(
      panelRows({ problems: listed, played: [], shown, open: { script: true, played: false } }).map(
        (row) => row.kind,
      ),
    ).toEqual(["head", "heading", "problem", "heading", "problem", "end", "head"]);
    expect(
      panelRows({
        problems: listed,
        played: [],
        shown: { ...shown, warning: false },
        open: { script: true, played: true },
      }).map((row) => (row.kind === "empty" ? row.text : row.kind)),
    ).toEqual([
      "head",
      "heading",
      "problem",
      "end",
      "head",
      "Nothing yet. Play the story and logs will appear here.",
      "end",
    ]);
  });

  it("scopes the dialog to the story, one script or an outline row's own problems", () => {
    const all = toProblems({
      [MAIN]: [diagnostic(1, 1)],
      [CHAPTER]: [diagnostic(2, 2)],
    });
    expect(scopedProblems({ kind: "story" }, all)).toHaveLength(2);
    expect(scopeContext({ kind: "story" })).toBe("Whole story");
    expect(
      scopedProblems({ kind: "script", path: "scripts/chapter_1.sd" }, all).map((p) => p.line),
    ).toEqual([3]);
    expect(scopeContext({ kind: "script", path: "scripts/chapter_1.sd" })).toBe("chapter_1");
    const rowDiagnostics = signal<readonly Diagnostic[]>([diagnostic(0, 3, "To do: tidy")]);
    const setup = {
      kind: "outline" as const,
      uri: MAIN,
      label: "Script setup",
      diagnostics: rowDiagnostics,
    };
    expect(scopedProblems(setup, all).map((p) => p.title)).toEqual(["To do: tidy"]);
    expect(scopeContext(setup)).toBe("Script setup");
    rowDiagnostics.value = [];
    expect(scopedProblems(setup, all)).toEqual([]);
  });

  it("maps a game's runtime error to a played entry at its script's line", () => {
    expect(
      playedFromRuntimeError({
        message: "Out of songs\nThe jukebox is empty.",
        type: 2,
        location: {
          uri: CHAPTER,
          range: { start: { line: 6, character: 2 }, end: { line: 6, character: 5 } },
        },
      }),
    ).toEqual({
      severity: "warning",
      title: "Out of songs",
      message: "The jukebox is empty.",
      path: "scripts/chapter_1.sd",
      line: 7,
    });
  });

  it("keeps the newest played messages up to its limit, and forgets a script's problems once they are fixed", () => {
    for (let i = 0; i < PLAYED_LIMIT + 5; i += 1) {
      problems.recordPlayed({ severity: "info", message: `m${i}` }, i);
    }
    expect(problems.played.value).toHaveLength(PLAYED_LIMIT);
    expect(problems.played.value[0]!.message).toBe("m5");
    problems.record({ uri: MAIN, diagnostics: [diagnostic(1, 1), diagnostic(2, 3)] });
    expect(problems.counts.value).toEqual({ errors: 1, problems: 1, notes: 1 });
    problems.record({ uri: MAIN, diagnostics: [] });
    expect(problems.diagnostics.value).toEqual({});
    expect(problems.counts.value).toEqual({ errors: 0, problems: 0, notes: 0 });
  });
});
