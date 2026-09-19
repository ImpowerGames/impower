import type { PreviewCompletionParams } from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewCompletionMessage";
import { describe, expect, it } from "vitest";
import { CompletionPreviewTracker } from "../src/completion/CompletionPreviewTracker";
import {
  CompletionCandidate,
  completionChanges,
  otherCursorChanges,
  SelectedCompletion,
  snippetText,
  TextChange,
} from "../src/completion/completionEdits";

const URI = "file:///project/main.sd";
const OTHER = "file:///project/scripts/other.sd";

const range = (line: number, start: number, end: number, endLine = line) => ({
  start: { line, character: start },
  end: { line: endLine, character: end },
});

/** `[[mia_|]]` on line 4: VS Code replaces `mia_` (characters 4 to 8). */
const selected = (text: string): SelectedCompletion => ({
  range: range(4, 4, 8),
  text,
});

const candidate = (
  text: string,
  extra: Partial<CompletionCandidate> = {},
): CompletionCandidate => ({
  start: { line: 4, character: 4 },
  text,
  snippet: false,
  additionalEdits: [],
  ...extra,
});

const CURSOR = { line: 4, character: 8 };

const setup = () => {
  const sent: PreviewCompletionParams[] = [];
  const tracker = new CompletionPreviewTracker((params) => sent.push(params));
  tracker.offered(URI, [
    candidate("mia_happy"),
    candidate("mia_sad"),
    candidate("mia_angry"),
  ]);
  return { sent, tracker };
};

const summary = (sent: PreviewCompletionParams[]) =>
  sent.map((p) =>
    p.state === "focus"
      ? `focus ${p.session} v${p.textDocument.version} ${p.contentChanges?.map((c) => c.text).join("+") ?? "null"}`
      : `close ${p.session} v${p.textDocument.version}${p.accepted ? " accepted" : ""}`,
  );

describe("the suggestion list as VS Code reports it", () => {
  it("reports the first highlight with the edit accepting it would make", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_happy"));
    expect(sent).toEqual([
      {
        textDocument: { uri: URI, version: 7 },
        session: 1,
        request: 1,
        state: "focus",
        contentChanges: [{ range: range(4, 4, 8), text: "mia_happy" }],
        selectedRange: { start: CURSOR, end: CURSOR },
      },
    ]);
  });

  it("reports every change of highlight, including a return to an earlier one", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_happy"));
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    tracker.observed(URI, 7, CURSOR, selected("mia_happy"));
    expect(summary(sent)).toEqual([
      "focus 1 v7 mia_happy",
      "focus 1 v7 mia_sad",
      "focus 1 v7 mia_happy",
    ]);
    expect(sent.map((p) => p.request)).toEqual([1, 2, 3]);
  });

  it("sends nothing when asked again about the highlight already reported", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_happy"));
    tracker.observed(URI, 7, CURSOR, selected("mia_happy"));
    tracker.observed(URI, 7, CURSOR, selected("mia_happy"));
    expect(summary(sent)).toEqual(["focus 1 v7 mia_happy"]);
  });

  it("reports a close when VS Code asks again with nothing highlighted, as after Escape", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    tracker.observed(URI, 7, CURSOR, undefined);
    expect(sent[1]).toEqual({
      textDocument: { uri: URI, version: 7 },
      session: 1,
      request: 2,
      state: "close",
    });
    expect(tracker.open).toBe(false);
  });

  it("sends nothing for a report with nothing highlighted while no list is open", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, undefined);
    tracker.left(URI, 7);
    expect(sent).toEqual([]);
  });

  it("numbers each opening of the list as a new session and keeps counting requests", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_happy"));
    tracker.observed(URI, 7, CURSOR, undefined);
    tracker.observed(URI, 7, CURSOR, selected("mia_happy"));
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    tracker.observed(URI, 7, CURSOR, undefined);
    expect(summary(sent)).toEqual([
      "focus 1 v7 mia_happy",
      "close 1 v7",
      "focus 2 v7 mia_happy",
      "focus 2 v7 mia_sad",
      "close 2 v7",
    ]);
    expect(sent.map((p) => p.request)).toEqual([1, 2, 3, 4, 5]);
  });

  it("reports an accepted suggestion as a close carrying the edit it made", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    tracker.changed(URI, 8, [{ range: range(4, 4, 8), text: "mia_sad" }]);
    // VS Code then asks with nothing highlighted; the list is already closed.
    tracker.observed(URI, 8, { line: 4, character: 11 }, undefined);
    expect(sent[1]).toEqual({
      textDocument: { uri: URI, version: 8 },
      session: 1,
      request: 2,
      state: "close",
      accepted: {
        version: 7,
        contentChanges: [{ range: range(4, 4, 8), text: "mia_sad" }],
      },
    });
    expect(sent).toHaveLength(2);
  });

  it("treats typing while the list is open as an edit, and reports the highlight again against the new version", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    tracker.changed(URI, 8, [{ range: range(4, 8, 8), text: "s" }]);
    expect(tracker.open).toBe(true);
    // The list narrows and keeps the same suggestion highlighted.
    tracker.observed(
      URI,
      8,
      { line: 4, character: 9 },
      {
        range: range(4, 4, 9),
        text: "mia_sad",
      },
    );
    expect(summary(sent)).toEqual(["focus 1 v7 mia_sad", "focus 1 v8 mia_sad"]);
    expect(sent[1]!.contentChanges).toEqual([
      { range: range(4, 4, 9), text: "mia_sad" },
    ]);
  });

  it("does not report a highlight again against a version the document has left", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    tracker.changed(URI, 8, [{ range: range(4, 8, 8), text: "s" }]);
    // A fresh answer arrives before VS Code reports the highlight at version 8.
    tracker.offered(URI, [
      candidate("mia_sad", {
        additionalEdits: [{ range: range(0, 0, 0), text: "include mia\n" }],
      }),
    ]);
    expect(summary(sent)).toEqual(["focus 1 v7 mia_sad"]);
  });

  it("still recognizes acceptance after a save while the list was open", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    // Auto-save: VS Code reports the document as changed with no changes.
    tracker.changed(URI, 7, []);
    tracker.changed(URI, 8, [{ range: range(4, 4, 8), text: "mia_sad" }]);
    expect(summary(sent)).toEqual([
      "focus 1 v7 mia_sad",
      "close 1 v8 accepted",
    ]);
  });

  it("does not mistake an edit that only resembles the highlighted one for acceptance", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    // Same edit, but not the next version: something else changed first.
    tracker.changed(URI, 9, [{ range: range(4, 4, 8), text: "mia_sad" }]);
    expect(tracker.open).toBe(true);
    expect(summary(sent)).toEqual(["focus 1 v7 mia_sad"]);
  });

  it("reports a close when the author leaves the editor holding the list", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    tracker.left(OTHER, null);
    expect(tracker.open).toBe(true);
    tracker.left(URI, null);
    expect(summary(sent)).toEqual(["focus 1 v7 mia_sad", "close 1 v7"]);
  });

  it("closes the list in one document when one opens in another", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    tracker.offered(OTHER, [candidate("mia_sad")]);
    tracker.observed(OTHER, 2, CURSOR, selected("mia_sad"));
    expect(
      sent.map((p) => `${p.state} ${p.session} ${p.textDocument.uri}`),
    ).toEqual([`focus 1 ${URI}`, `close 1 ${URI}`, `focus 2 ${OTHER}`]);
  });

  it("forgets an open list without a report when the preview is gone", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    tracker.reset();
    tracker.observed(URI, 7, CURSOR, undefined);
    expect(summary(sent)).toEqual(["focus 1 v7 mia_sad"]);
  });

  it("reports a suggestion the language server did not offer as unavailable", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, selected("mia_word"));
    expect(sent[0]!.contentChanges).toBeNull();
  });

  it("reports the highlight again when a later answer changes its edit", () => {
    const sent: PreviewCompletionParams[] = [];
    const tracker = new CompletionPreviewTracker((p) => sent.push(p));
    tracker.offered(URI, [candidate("mia_sad")]);
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    // The same items again: nothing changes, nothing is sent.
    tracker.offered(URI, [candidate("mia_sad")]);
    // Resolving the item adds a secondary edit.
    const secondary: TextChange = {
      range: range(0, 0, 0),
      text: "include x\n",
    };
    tracker.offered(URI, [
      candidate("mia_sad", { additionalEdits: [secondary] }),
    ]);
    expect(summary(sent)).toEqual([
      "focus 1 v7 mia_sad",
      "focus 1 v7 mia_sad+include x\n",
    ]);
  });
});

describe("the edit a highlighted suggestion would make", () => {
  it("is the reported replacement when one language-server item matches it", () => {
    expect(
      completionChanges(selected("mia_sad"), [
        candidate("mia_happy"),
        candidate("mia_sad"),
      ]),
    ).toEqual([{ range: range(4, 4, 8), text: "mia_sad" }]);
  });

  it("tells items with the same label apart by what they insert", () => {
    const items = [
      candidate("sad", { start: { line: 4, character: 4 } }),
      candidate('"sad"', { start: { line: 4, character: 4 } }),
    ];
    expect(completionChanges(selected('"sad"'), items)).toEqual([
      { range: range(4, 4, 8), text: '"sad"' },
    ]);
  });

  it("is unknown when items VS Code reports identically make different edits", () => {
    const items = [
      candidate("mia_sad"),
      candidate("mia_sad", {
        additionalEdits: [{ range: range(0, 0, 0), text: "include mia\n" }],
      }),
    ];
    expect(completionChanges(selected("mia_sad"), items)).toBeNull();
  });

  it("is shared by items VS Code reports identically that make the same edit", () => {
    const secondary = { range: range(0, 0, 0), text: "include mia\n" };
    const items = [
      candidate("mia_sad", { additionalEdits: [secondary] }),
      candidate("mia_sad", { additionalEdits: [secondary] }),
    ];
    expect(completionChanges(selected("mia_sad"), items)).toEqual([
      { range: range(4, 4, 8), text: "mia_sad" },
      secondary,
    ]);
  });

  it("includes secondary edits, last in the document first", () => {
    const before = { range: range(0, 0, 0), text: "include mia\n" };
    const after = { range: range(9, 0, 0), text: "// used\n" };
    expect(
      completionChanges(selected("mia_sad"), [
        candidate("mia_sad", { additionalEdits: [before, after] }),
      ]),
    ).toEqual([after, { range: range(4, 4, 8), text: "mia_sad" }, before]);
  });

  it("does not match an item that replaces from elsewhere", () => {
    expect(
      completionChanges(selected("mia_sad"), [
        candidate("mia_sad", { start: { line: 4, character: 2 } }),
      ]),
    ).toBeNull();
  });

  it("matches an item without a range by what it inserts", () => {
    expect(
      completionChanges(selected("mia_sad"), [
        candidate("mia_sad", { start: undefined }),
      ]),
    ).toEqual([{ range: range(4, 4, 8), text: "mia_sad" }]);
  });

  it("matches a snippet by the text it inserts", () => {
    const items = [
      candidate('"${1:happy}"$0', { snippet: true }),
      candidate('"${1:sad}"$0', { snippet: true }),
    ];
    expect(completionChanges(selected('"sad"'), items)).toEqual([
      { range: range(4, 4, 8), text: '"sad"' },
    ]);
  });

  it("matches a multi-line snippet VS Code re-indented to its line", () => {
    const item = candidate(
      "define ${1:name} with\n\t${2:key} = ${3:value}\nend",
      {
        snippet: true,
      },
    );
    const reported = selected("define name with\n      key = value\n    end");
    expect(completionChanges(reported, [item])).toEqual([
      { range: reported.range, text: reported.text },
    ]);
  });
});

describe("the text a snippet inserts", () => {
  it("fills placeholders with their defaults and drops bare tab stops", () => {
    expect(snippetText("[[${1:mia}:${2:happy}]]$0")).toBe("[[mia:happy]]");
    expect(snippetText("a$1b${2}c")).toBe("abc");
  });

  it("fills nested placeholders", () => {
    expect(snippetText("${1:outer ${2:inner} end}")).toBe("outer inner end");
  });

  it("takes a choice's first option", () => {
    expect(snippetText("${1|happy,sad|}")).toBe("happy");
    expect(snippetText("${1|a\\,b,c|}")).toBe("a,b");
  });

  it("keeps escaped characters as text", () => {
    expect(snippetText("cost \\$5 \\}")).toBe("cost $5 }");
  });

  it("uses a variable's default and nothing for a variable without one", () => {
    expect(snippetText("${TM_FILENAME:untitled}")).toBe("untitled");
    expect(snippetText("x$TM_FILENAME y")).toBe("x y");
  });
});

describe("the tracker with several cursors and a reloaded preview", () => {
  it("reports the edit at every cursor, and the highlight again when the other cursors change", () => {
    const { sent, tracker } = setup();
    const other = { range: range(6, 4, 8), text: "mia_sad" };
    tracker.observed(URI, 7, CURSOR, {
      ...selected("mia_sad"),
      otherCursors: [other],
    });
    tracker.observed(URI, 7, CURSOR, {
      ...selected("mia_sad"),
      otherCursors: [other],
    });
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    expect(summary(sent)).toEqual([
      "focus 1 v7 mia_sad+mia_sad",
      "focus 1 v7 mia_sad",
    ]);
    expect(sent[0]!.contentChanges).toEqual([
      other,
      { range: range(4, 4, 8), text: "mia_sad" },
    ]);
  });

  it("reports the highlight as unavailable when another cursor's edit is unknown", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, CURSOR, {
      ...selected("mia_sad"),
      otherCursors: null,
    });
    expect(sent[0]!.contentChanges).toBeNull();
  });

  it("recognizes acceptance at every cursor", () => {
    const { sent, tracker } = setup();
    const other = { range: range(6, 4, 8), text: "mia_sad" };
    tracker.observed(URI, 7, CURSOR, {
      ...selected("mia_sad"),
      otherCursors: [other],
    });
    tracker.changed(URI, 8, [
      { range: range(4, 4, 8), text: "mia_sad" },
      other,
    ]);
    expect(summary(sent)).toEqual([
      "focus 1 v7 mia_sad+mia_sad",
      "close 1 v8 accepted",
    ]);
  });

  it("sends the open list's highlight again on request, and nothing when no list is open", () => {
    const { sent, tracker } = setup();
    tracker.resend();
    tracker.observed(URI, 7, CURSOR, selected("mia_sad"));
    tracker.resend();
    tracker.observed(URI, 7, CURSOR, undefined);
    tracker.resend();
    expect(summary(sent)).toEqual([
      "focus 1 v7 mia_sad",
      "focus 1 v7 mia_sad",
      "close 1 v7",
    ]);
    expect(sent.map((p) => p.request)).toEqual([1, 2, 3]);
  });
});

describe("what accepting inserts at the other cursors", () => {
  const lines = [
    "scene START",
    "  [[mia_]]",
    "  [[mia_]]",
    "  [[bob_]]",
    "  [[mia_x]]",
    "    ",
  ];
  const lineText = (line: number) => lines[line] ?? "";
  const at = (line: number, character: number) => ({ line, character });
  const cursor = (line: number, character: number) => ({
    anchor: at(line, character),
    active: at(line, character),
  });
  // The primary cursor is after `mia_` on line 1; VS Code replaces `mia_`.
  const primary = cursor(1, 8);
  const reported = { range: range(1, 4, 8), text: "mia_sad" };

  it("replaces the same text before a cursor that has it", () => {
    expect(
      otherCursorChanges(reported, primary, [cursor(2, 8)], lineText),
    ).toEqual([{ range: range(2, 4, 8), text: "mia_sad" }]);
  });

  it("only inserts at a cursor whose text before differs", () => {
    expect(
      otherCursorChanges(reported, primary, [cursor(3, 8)], lineText),
    ).toEqual([{ range: range(3, 8, 8), text: "mia_sad" }]);
  });

  it("replaces the same text after a cursor only where it is the same", () => {
    // The primary also replaces `]]` after itself (VS Code's replace mode).
    const replacing = { range: range(1, 4, 10), text: "mia_sad" };
    expect(
      otherCursorChanges(
        replacing,
        primary,
        [cursor(2, 8), cursor(4, 8)],
        lineText,
      ),
    ).toEqual([
      { range: range(2, 4, 10), text: "mia_sad" },
      { range: range(4, 4, 8), text: "mia_sad" },
    ]);
  });

  it("replaces a cursor's own selection when the text around it differs", () => {
    // `_` of `bob_` selected, the cursor after it; `bob_` is not `mia_`.
    const selection = { anchor: at(3, 7), active: at(3, 8) };
    expect(
      otherCursorChanges(reported, primary, [selection], lineText),
    ).toEqual([{ range: range(3, 7, 8), text: "mia_sad" }]);
  });

  it("keeps a selected cursor's own selection inside the replaced text when the text before matches", () => {
    // `x` of `mia_x` selected, the cursor before it; `mia_` matches.
    const selection = { anchor: at(4, 9), active: at(4, 8) };
    expect(
      otherCursorChanges(reported, primary, [selection], lineText),
    ).toEqual([{ range: range(4, 4, 9), text: "mia_sad" }]);
  });

  it("re-indents a multi-line insertion to each cursor's line", () => {
    // Reported re-indented to the primary line, whose indentation is two
    // spaces; the other cursor's line is indented four.
    const block = {
      range: range(1, 2, 8),
      text: "define x with\n    a = 1\n  end",
    };
    expect(
      otherCursorChanges(block, cursor(1, 8), [cursor(5, 4)], lineText),
    ).toEqual([
      { range: range(5, 4, 4), text: "define x with\n      a = 1\n    end" },
    ]);
  });

  it("keeps the document's line breaks when re-indenting", () => {
    const block = { range: range(1, 2, 8), text: "define x with\r\n  end" };
    expect(
      otherCursorChanges(block, cursor(1, 8), [cursor(5, 4)], lineText),
    ).toEqual([{ range: range(5, 4, 4), text: "define x with\r\n    end" }]);
  });

  it("is unknown when a later line lacks the primary line's indentation", () => {
    const block = { range: range(1, 2, 8), text: "define x with\na = 1" };
    expect(
      otherCursorChanges(block, cursor(1, 8), [cursor(5, 4)], lineText),
    ).toBeNull();
  });

  it("is unknown when the reported replacement is not on the cursor's line", () => {
    const elsewhere = { range: range(0, 0, 3), text: "mia_sad" };
    expect(
      otherCursorChanges(elsewhere, primary, [cursor(2, 8)], lineText),
    ).toBeNull();
  });
});
