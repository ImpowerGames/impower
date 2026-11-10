import { signal } from "@preact/signals";
import { beforeEach, describe, expect, it } from "vitest";
import type { Diagnostic } from "vscode-languageserver-protocol";

const {
  headCount,
  isChoiceLive,
  panelRows,
  playedMessages,
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

const { choiceMadeSource, runStartSource } = await import(
  "../../src/modules/spark-editor/workspace/problems/gameSources"
);
const { default: workspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);
const { GameChosePathToContinueMessage } = await import(
  "@impower/spark-engine/src/game/core/classes/messages/GameChosePathToContinueMessage"
);
const { GameStartedMessage } = await import(
  "@impower/spark-engine/src/game/core/classes/messages/GameStartedMessage"
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

  it("keeps the fixes the server sent that change the text, with the script's version", () => {
    const use = {
      name: "Use alice instead",
      done: "Changed to alice.",
      expect: "alcie",
      kind: "name",
      changes: [{ from: 5, to: 10, insert: "alice" }],
    };
    const add = { name: "Add alcie to assets", done: "Added.", changes: [] };
    const listed = toProblems(
      {
        [MAIN]: [
          { ...diagnostic(1, 2, "Cannot find alcie"), data: [use, add] },
          { ...diagnostic(2, 2, "Plain"), data: { closeMatch: {} } },
          diagnostic(3, 1),
        ],
      },
      { [MAIN]: 7 },
    );
    expect(listed.map((p) => [p.actions, p.version])).toEqual([
      [[use], 7],
      [[], 7],
      [[], 7],
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

  it("gives an outline row's problems the published version only while the outline holds that publish's diagnostics", () => {
    const published = [diagnostic(0, 2, "Cannot find alcie"), diagnostic(3, 3)];
    const row = signal<readonly Diagnostic[]>([published[0]!]);
    const scope = { kind: "outline" as const, uri: MAIN, label: "start", diagnostics: row };
    const versions = { [MAIN]: 2 };
    expect(
      scopedProblems(scope, [], { diagnostics: { [MAIN]: published }, versions }).map(
        (p) => p.version,
      ),
    ).toEqual([2]);
    const republished = [diagnostic(0, 2, "Cannot find alcie")];
    expect(
      scopedProblems(scope, [], { diagnostics: { [MAIN]: republished }, versions }).map(
        (p) => p.version,
      ),
    ).toEqual([undefined]);
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

describe("choices in the Played log", () => {
  const chose = (checkpoint: number, text: string) =>
    GameChosePathToContinueMessage.type.notification({
      location: {
        uri: MAIN,
        range: { start: { line: 3, character: 0 }, end: { line: 3, character: 1 } },
      },
      checkpoint,
      text,
    });
  const started = () => GameStartedMessage.type.notification({});
  const choices = () =>
    problems.played.value.filter((entry) => entry.checkpoint != null);
  const live = () =>
    choices().map((entry) =>
      isChoiceLive(entry, problems.played.value, problems.run.value),
    );

  beforeEach(() => {
    problems.addPlayedSource(choiceMadeSource);
    problems.addRunSource(runStartSource);
  });

  it("records each choice made as a played note naming the chosen option on one line, with no script link", () => {
    problems.receive(started());
    problems.receive(chose(3, "  Rest by the fire.\nThen sleep.  "));
    expect(choices()).toEqual([
      expect.objectContaining({
        severity: "info",
        title: "Chose · Rest by the fire.",
        checkpoint: 3,
        run: problems.run.value,
      }),
    ]);
    expect(choices()[0]!.path).toBeUndefined();
    expect(choices()[0]!.message).toBe("");
  });

  it("never counts a choice as a problem or a note, and never opens the panel", () => {
    const opened = workspaceSettings.projectSettings.value.previewPanelHeight;
    problems.receive(started());
    problems.receive(chose(1, "Pay."));
    problems.receive(chose(3, "Rest."));
    expect(problems.counts.value).toEqual({ errors: 0, problems: 0, notes: 0 });
    expect(problems.problems.value).toEqual([]);
    expect(scopedProblems({ kind: "story" }, problems.problems.value)).toEqual([]);
    expect(problems.summary.value).toEqual({});
    expect(headCount(playedMessages(problems.played.value)).text).toBe("");
    expect(workspaceSettings.projectSettings.value.previewPanelHeight).toBe(opened);
    expect(problems.panelOpen.value).toBe(false);
  });

  const entry = (id: number, run: number, checkpoint: number) => ({
    id,
    run,
    checkpoint,
    time: 0,
    severity: "info" as const,
    message: "",
  });
  const forkedAt3 = [entry(1, 2, 1), entry(2, 2, 3), entry(3, 2, 5), entry(4, 2, 3)];

  it.each([
    ["the current run before the point it forked from", forkedAt3[0]!, 2, true],
    ["the current run at the point it forked from", forkedAt3[1]!, 2, false],
    ["the current run after the point it forked from", forkedAt3[2]!, 2, false],
    ["the choice it forked with", forkedAt3[3]!, 2, true],
    ["an earlier run", forkedAt3[0]!, 3, false],
  ] as const)("holds a choice made in %s", (_case, choice, run, held) => {
    expect(isChoiceLive(choice, forkedAt3, run)).toBe(held);
  });

  it("drops a choice the engine's history no longer holds, and trusts the log when no history is known", () => {
    expect(isChoiceLive(forkedAt3[0]!, forkedAt3, 2, [3])).toBe(false);
    expect(isChoiceLive(forkedAt3[3]!, forkedAt3, 2, [3])).toBe(true);
    expect(isChoiceLive(forkedAt3[0]!, forkedAt3, 2, null)).toBe(true);
  });

  it("derives whether a choice is still held from the run and later choices", () => {
    problems.receive(started());
    problems.receive(chose(1, "Pay."));
    problems.receive(chose(3, "Rest."));
    problems.receive(chose(5, "Sleep."));
    expect(live()).toEqual([true, true, true]);
    problems.receive(chose(3, "Walk on."));
    expect(live()).toEqual([true, false, false, true]);
    problems.receive(started());
    expect(live()).toEqual([false, false, false, false]);
    problems.receive(chose(1, "Climb."));
    expect(live()).toEqual([false, false, false, false, true]);
  });
});
