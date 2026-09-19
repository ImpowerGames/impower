import type { PreviewCompletionParams } from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewCompletionMessage";
import { describe, expect, it } from "vitest";
import { CompletionPreviewTracker } from "../src/completion/CompletionPreviewTracker";
import {
  CompletionCandidate,
  completionChanges,
  Cursor,
  Placement,
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
  keepWhitespace: false,
  additionalEdits: [],
  ...extra,
});

const at = (line: number, character: number) => ({ line, character });

const CURSOR = at(4, 8);

/** The document the list is open in: line 4, and line 6 too, is `  [[mia_]]`,
 *  in an editor indenting with four spaces. */
const LINES = [
  "scene START",
  "",
  "",
  "",
  "  [[mia_]]",
  "",
  "  [[mia_]]",
  "end",
];
const place = (character = 8, others: Cursor[] = []): Placement => ({
  primary: { anchor: at(4, character), active: at(4, character) },
  others,
  lineText: (line) => LINES[line] ?? "",
  tabSize: 4,
  insertSpaces: true,
  eol: "\n",
});
const PLACE = place();

/** The edit at the single cursor of `PLACE`. */
const changesOf = (
  selected: SelectedCompletion,
  items: readonly CompletionCandidate[],
) => completionChanges(selected, items, PLACE);

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
    tracker.observed(URI, 7, PLACE, selected("mia_happy"));
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
    tracker.observed(URI, 7, PLACE, selected("mia_happy"));
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
    tracker.observed(URI, 7, PLACE, selected("mia_happy"));
    expect(summary(sent)).toEqual([
      "focus 1 v7 mia_happy",
      "focus 1 v7 mia_sad",
      "focus 1 v7 mia_happy",
    ]);
    expect(sent.map((p) => p.request)).toEqual([1, 2, 3]);
  });

  it("sends nothing when asked again about the highlight already reported", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, PLACE, selected("mia_happy"));
    tracker.observed(URI, 7, PLACE, selected("mia_happy"));
    tracker.observed(URI, 7, PLACE, selected("mia_happy"));
    expect(summary(sent)).toEqual(["focus 1 v7 mia_happy"]);
  });

  it("reports a close when VS Code asks again with nothing highlighted, as after Escape", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
    tracker.observed(URI, 7, PLACE, undefined);
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
    tracker.observed(URI, 7, PLACE, undefined);
    tracker.left(URI, 7);
    expect(sent).toEqual([]);
  });

  it("numbers each opening of the list as a new session and keeps counting requests", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, PLACE, selected("mia_happy"));
    tracker.observed(URI, 7, PLACE, undefined);
    tracker.observed(URI, 7, PLACE, selected("mia_happy"));
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
    tracker.observed(URI, 7, PLACE, undefined);
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
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
    tracker.changed(URI, 8, [{ range: range(4, 4, 8), text: "mia_sad" }]);
    // VS Code then asks with nothing highlighted; the list is already closed.
    tracker.observed(URI, 8, place(11), undefined);
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
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
    tracker.changed(URI, 8, [{ range: range(4, 8, 8), text: "s" }]);
    expect(tracker.open).toBe(true);
    // The list narrows and keeps the same suggestion highlighted.
    tracker.observed(URI, 8, place(9), {
      range: range(4, 4, 9),
      text: "mia_sad",
    });
    expect(summary(sent)).toEqual(["focus 1 v7 mia_sad", "focus 1 v8 mia_sad"]);
    expect(sent[1]!.contentChanges).toEqual([
      { range: range(4, 4, 9), text: "mia_sad" },
    ]);
  });

  it("does not report a highlight again against a version the document has left", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
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
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
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
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
    // Same edit, but not the next version: something else changed first.
    tracker.changed(URI, 9, [{ range: range(4, 4, 8), text: "mia_sad" }]);
    expect(tracker.open).toBe(true);
    expect(summary(sent)).toEqual(["focus 1 v7 mia_sad"]);
  });

  it("reports a close when the author leaves the editor holding the list", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
    tracker.left(OTHER, null);
    expect(tracker.open).toBe(true);
    tracker.left(URI, null);
    expect(summary(sent)).toEqual(["focus 1 v7 mia_sad", "close 1 v7"]);
  });

  it("closes the list in one document when one opens in another", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
    tracker.offered(OTHER, [candidate("mia_sad")]);
    tracker.observed(OTHER, 2, PLACE, selected("mia_sad"));
    expect(
      sent.map((p) => `${p.state} ${p.session} ${p.textDocument.uri}`),
    ).toEqual([`focus 1 ${URI}`, `close 1 ${URI}`, `focus 2 ${OTHER}`]);
  });

  it("forgets an open list without a report when the preview is gone", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
    tracker.reset();
    tracker.observed(URI, 7, PLACE, undefined);
    expect(summary(sent)).toEqual(["focus 1 v7 mia_sad"]);
  });

  it("reports a suggestion the language server did not offer as unavailable", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, PLACE, selected("mia_word"));
    expect(sent[0]!.contentChanges).toBeNull();
  });

  it("reports the highlight again when a later answer changes its edit", () => {
    const sent: PreviewCompletionParams[] = [];
    const tracker = new CompletionPreviewTracker((p) => sent.push(p));
    tracker.offered(URI, [candidate("mia_sad")]);
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
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
      changesOf(selected("mia_sad"), [
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
    expect(changesOf(selected('"sad"'), items)).toEqual([
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
    expect(changesOf(selected("mia_sad"), items)).toBeNull();
  });

  it("is shared by items VS Code reports identically that make the same edit", () => {
    const secondary = { range: range(0, 0, 0), text: "include mia\n" };
    const items = [
      candidate("mia_sad", { additionalEdits: [secondary] }),
      candidate("mia_sad", { additionalEdits: [secondary] }),
    ];
    expect(changesOf(selected("mia_sad"), items)).toEqual([
      { range: range(4, 4, 8), text: "mia_sad" },
      secondary,
    ]);
  });

  it("includes secondary edits, last in the document first", () => {
    const before = { range: range(0, 0, 0), text: "include mia\n" };
    const after = { range: range(9, 0, 0), text: "// used\n" };
    expect(
      changesOf(selected("mia_sad"), [
        candidate("mia_sad", { additionalEdits: [before, after] }),
      ]),
    ).toEqual([after, { range: range(4, 4, 8), text: "mia_sad" }, before]);
  });

  it("does not match an item that replaces from elsewhere", () => {
    expect(
      changesOf(selected("mia_sad"), [
        candidate("mia_sad", { start: { line: 4, character: 2 } }),
      ]),
    ).toBeNull();
  });

  it("matches an item without a range by what it inserts", () => {
    expect(
      changesOf(selected("mia_sad"), [
        candidate("mia_sad", { start: undefined }),
      ]),
    ).toEqual([{ range: range(4, 4, 8), text: "mia_sad" }]);
  });

  it("matches a snippet by the text it inserts", () => {
    const items = [
      candidate('"${1:happy}"$0', { snippet: true }),
      candidate('"${1:sad}"$0', { snippet: true }),
    ];
    expect(changesOf(selected('"sad"'), items)).toEqual([
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
    // Reported re-indented to line 4, and inserted re-indented to it with
    // the tab written in the editor's spaces.
    const reported = selected("define name with\n  \tkey = value\n  end");
    expect(changesOf(reported, [item])).toEqual([
      {
        range: reported.range,
        text: "define name with\n    key = value\n  end",
      },
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
  const second = { anchor: at(6, 8), active: at(6, 8) };

  it("reports the edit at every cursor, and the highlight again when the other cursors change", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, place(8, [second]), selected("mia_sad"));
    tracker.observed(URI, 7, place(8, [second]), selected("mia_sad"));
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
    expect(summary(sent)).toEqual([
      "focus 1 v7 mia_sad+mia_sad",
      "focus 1 v7 mia_sad",
    ]);
    expect(sent[0]!.contentChanges).toEqual([
      { range: range(6, 4, 8), text: "mia_sad" },
      { range: range(4, 4, 8), text: "mia_sad" },
    ]);
  });

  it("recognizes acceptance at every cursor", () => {
    const { sent, tracker } = setup();
    tracker.observed(URI, 7, place(8, [second]), selected("mia_sad"));
    tracker.changed(URI, 8, [
      { range: range(4, 4, 8), text: "mia_sad" },
      { range: range(6, 4, 8), text: "mia_sad" },
    ]);
    expect(summary(sent)).toEqual([
      "focus 1 v7 mia_sad+mia_sad",
      "close 1 v8 accepted",
    ]);
  });

  it("sends the open list's highlight again on request, and nothing when no list is open", () => {
    const { sent, tracker } = setup();
    tracker.resend();
    tracker.observed(URI, 7, PLACE, selected("mia_sad"));
    tracker.resend();
    tracker.observed(URI, 7, PLACE, undefined);
    tracker.resend();
    expect(summary(sent)).toEqual([
      "focus 1 v7 mia_sad",
      "focus 1 v7 mia_sad",
      "close 1 v7",
    ]);
    expect(sent.map((p) => p.request)).toEqual([1, 2, 3]);
  });
});

describe("what accepting inserts at every cursor", () => {
  const lines = [
    "scene START",
    "  [[mia_]]",
    "  [[mia_]]",
    "  [[bob_]]",
    "  [[mia_x]]",
    "    ",
    "\t\tpro",
    "  pro",
    "    pro",
  ];
  const cursor = (line: number, character: number) => ({
    anchor: at(line, character),
    active: at(line, character),
  });
  /** The primary cursor after `mia_` on line 1, VS Code replacing `mia_`. */
  const on = (others: Cursor[], options: Partial<Placement> = {}) => ({
    primary: cursor(1, 8),
    others,
    lineText: (line: number) => lines[line] ?? "",
    tabSize: 4,
    insertSpaces: true,
    eol: "\n",
    ...options,
  });
  const reported = { range: range(1, 4, 8), text: "mia_sad" };
  const plain = (text: string, extra: Partial<CompletionCandidate> = {}) =>
    candidate(text, { start: at(1, 4), ...extra });

  it("replaces the same text before a cursor that has it", () => {
    expect(
      completionChanges(reported, [plain("mia_sad")], on([cursor(2, 8)])),
    ).toEqual([
      { range: range(2, 4, 8), text: "mia_sad" },
      { range: range(1, 4, 8), text: "mia_sad" },
    ]);
  });

  it("only inserts at a cursor whose text before differs", () => {
    expect(
      completionChanges(reported, [plain("mia_sad")], on([cursor(3, 8)])),
    ).toEqual([
      { range: range(3, 8, 8), text: "mia_sad" },
      { range: range(1, 4, 8), text: "mia_sad" },
    ]);
  });

  it("replaces the same text after a cursor only where it is the same", () => {
    // The primary also replaces `]]` after itself (VS Code's replace mode).
    const replacing = { range: range(1, 4, 10), text: "mia_sad" };
    expect(
      completionChanges(
        replacing,
        [plain("mia_sad")],
        on([cursor(2, 8), cursor(4, 8)]),
      ),
    ).toEqual([
      { range: range(4, 4, 8), text: "mia_sad" },
      { range: range(2, 4, 10), text: "mia_sad" },
      { range: range(1, 4, 10), text: "mia_sad" },
    ]);
  });

  it("replaces a cursor's own selection when the text around it differs", () => {
    // `_` of `bob_` selected, the cursor after it; `bob_` is not `mia_`.
    const selection = { anchor: at(3, 7), active: at(3, 8) };
    expect(
      completionChanges(reported, [plain("mia_sad")], on([selection])),
    ).toContainEqual({ range: range(3, 7, 8), text: "mia_sad" });
  });

  it("keeps a selected cursor's own selection inside the replaced text when the text before matches", () => {
    // `x` of `mia_x` selected, the cursor before it; `mia_` matches.
    const selection = { anchor: at(4, 9), active: at(4, 8) };
    expect(
      completionChanges(reported, [plain("mia_sad")], on([selection])),
    ).toContainEqual({ range: range(4, 4, 9), text: "mia_sad" });
  });

  it("indents a multi-line insertion's later lines like each cursor's line", () => {
    const block = { range: range(1, 4, 8), text: "mia:\n- sad" };
    expect(
      completionChanges(block, [plain("mia:\n- sad")], on([cursor(5, 4)])),
    ).toEqual([
      { range: range(5, 4, 4), text: "mia:\n    - sad" },
      { range: range(1, 4, 8), text: "mia:\n  - sad" },
    ]);
  });

  it("writes adjusted indentation in the editor's unit and the document's line breaks", () => {
    const block = { range: range(1, 4, 8), text: "mia:\n\t- sad" };
    expect(
      completionChanges(
        block,
        [plain("mia:\n\t- sad")],
        on([], { insertSpaces: false, tabSize: 2, eol: "\r\n" }),
      ),
    ).toEqual([{ range: range(1, 4, 8), text: "mia:\r\n\t\t- sad" }]);
  });

  it("inserts an as-is item's text unchanged where the lines start in the same column", () => {
    // Two tabs and two spaces: the first text is at column 3 on both lines.
    const asIs = plain("pro:\n\t\t  - ", {
      start: at(6, 2),
      keepWhitespace: true,
    });
    const block = { range: range(6, 2, 5), text: "pro:\n\t\t  - " };
    expect(
      completionChanges(
        block,
        [asIs],
        on([cursor(7, 5)], { primary: cursor(6, 5) }),
      ),
    ).toEqual([
      { range: range(7, 2, 5), text: "pro:\n\t\t  - " },
      { range: range(6, 2, 5), text: "pro:\n\t\t  - " },
    ]);
  });

  it("re-indents an as-is item at a cursor whose line starts in another column", () => {
    const asIs = plain("pro:\n  - ", { start: at(7, 2), keepWhitespace: true });
    const block = { range: range(7, 2, 5), text: "pro:\n  - " };
    expect(
      completionChanges(
        block,
        [asIs],
        on([cursor(8, 7)], { primary: cursor(7, 5) }),
      ),
    ).toEqual([
      { range: range(8, 4, 7), text: "pro:\n      - " },
      { range: range(7, 2, 5), text: "pro:\n  - " },
    ]);
  });

  it("is unknown when matching items insert different text at the cursors", () => {
    const items = [
      plain("mia:\n- sad"),
      plain("mia:\n- sad", { keepWhitespace: true }),
    ];
    const block = { range: range(1, 4, 8), text: "mia:\n- sad" };
    expect(completionChanges(block, items, on([]))).toBeNull();
  });

  it("is unknown when the reported replacement is not on the cursor's line", () => {
    const elsewhere = { range: range(0, 0, 3), text: "mia_sad" };
    expect(
      completionChanges(
        elsewhere,
        [plain("mia_sad", { start: at(0, 0) })],
        on([cursor(2, 8)]),
      ),
    ).toBeNull();
  });
});
