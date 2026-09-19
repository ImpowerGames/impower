// Autocomplete suggestion previews (#634): what the editor reports for each
// highlighted option, and the edit it reports.
//
// The preview compiles the document as accepting the highlighted option would
// leave it, so the reported edit has to be the one acceptance makes, computed
// without making it: the real document, its history and its version must not
// move while an author only browses.
import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  completionStatus,
  currentCompletions,
  moveCompletionSelection,
  startCompletion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { history, undoDepth } from "@codemirror/commands";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  completionChanges,
  completionPreview,
  type CompletionPreviewEvent,
} from "@impower/codemirror-vscode-lsp-client/src";
import {
  getValidFor,
  serverCompletionOption,
} from "@impower/codemirror-vscode-lsp-client/src/completion";
import { afterEach, describe, expect, it } from "vitest";
import type * as lsp from "vscode-languageserver-protocol";

// The trigger characters the Sparkdown language server declares for image
// directives, which decide where a completion's replaced range starts.
const TRIGGERS = ["[", ":", " ", "."];
const validFor = getValidFor(TRIGGERS);

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
});

/** An editor whose completion source offers `items` through the same option
 *  builder the language-server source uses. */
function mount(
  doc: string,
  cursor: number | EditorSelection,
  items: lsp.CompletionItem[],
  ...extensions: Extension[]
) {
  const events: CompletionPreviewEvent[] = [];
  // Every transaction created with a document change. The web editor's
  // extender announces each one as an edit and a save, so browsing must
  // create none, dispatched or not.
  const changing: string[] = [];
  const source = (context: CompletionContext) => ({
    from: context.matchBefore(validFor)?.from ?? context.pos,
    validFor,
    options: items.map((item, index) =>
      serverCompletionOption(item, index, undefined, validFor),
    ),
  });
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection:
        typeof cursor === "number" ? EditorSelection.cursor(cursor) : cursor,
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        history(),
        autocompletion({ override: [source], activateOnTyping: true }),
        completionPreview((event) => events.push(event)),
        EditorState.transactionExtender.of((tr) => {
          if (tr.docChanged) changing.push(tr.newDoc.toString());
          return null;
        }),
        ...extensions,
      ],
    }),
    parent: document.body.appendChild(document.createElement("div")),
  });
  return { view, events, changing };
}

/** Open the list and wait until an option is highlighted. */
async function open(v: EditorView) {
  startCompletion(v);
  for (let i = 0; i < 100 && currentCompletions(v.state).length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(completionStatus(v.state)).toBe("active");
  // CodeMirror ignores accepting and moving for its interaction delay (75ms)
  // after the list opens, so a keystroke that raced the list cannot pick.
  await new Promise((resolve) => setTimeout(resolve, 100));
}

/** The document accepting the highlighted option produces, in a separate
 *  editor, so the comparison is with acceptance itself. */
async function accepted(
  doc: string,
  cursor: number | EditorSelection,
  items: lsp.CompletionItem[],
  moves = 0,
) {
  const { view: other } = mount(doc, cursor, items);
  await open(other);
  for (let i = 0; i < moves; i++) moveCompletionSelection(true)(other);
  acceptCompletion(other);
  const text = other.state.doc.toString();
  other.destroy();
  return text;
}

const item = (label: string, extra: Partial<lsp.CompletionItem> = {}) =>
  ({ label, ...extra }) as lsp.CompletionItem;

describe("the edit reported for a highlighted option", () => {
  const cases: {
    name: string;
    doc: string;
    cursor: number | EditorSelection;
    items: lsp.CompletionItem[];
  }[] = [
    {
      name: "replaces the typed prefix and keeps the text after the cursor",
      doc: "  [[bunny_a]]\n  Hello.\n",
      cursor: "  [[bunny_a".length,
      items: [item("bunny_angry"), item("bunny_annoyed")],
    },
    {
      name: "replaces in the middle of an attribute list",
      doc: "  [[mia:hat:|glasses]]\n",
      cursor: "  [[mia:hat:".length,
      items: [item("sad"), item("happy")],
    },
    {
      name: "inserts a multiline snippet at its initial placeholder values",
      doc: "de\n",
      cursor: 2,
      items: [
        item("define", {
          insertTextFormat: 2,
          insertText: "define ${1:name} as ${2:type} with\n  $0\nend",
        }),
      ],
    },
    {
      name: "applies to every cursor of a multiple selection",
      doc: "  [[bun]]\n  [[bun]]\n",
      cursor: EditorSelection.create([
        EditorSelection.cursor("  [[bun".length),
        EditorSelection.cursor("  [[bun]]\n  [[bun".length),
      ]),
      items: [item("bunny_angry")],
    },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const { view: v, events, changing } = mount(c.doc, c.cursor, c.items);
      await open(v);
      const focus = events.at(-1)!;
      expect(focus.state).toBe("focus");
      expect(focus.changes).toBeTruthy();
      const previewed = focus.changes!.apply(v.state.doc).toString();
      expect(previewed).toBe(await accepted(c.doc, c.cursor, c.items));
      // Browsing never touched the real document or its history, and never
      // created a transaction a host could take for an edit.
      expect(v.state.doc.toString()).toBe(c.doc);
      expect(undoDepth(v.state)).toBe(0);
      expect(changing).toEqual([]);
    });
  }

  it("follows the document when typing narrows the list", async () => {
    const doc = "  [[bunny_]]\n";
    const cursor = "  [[bunny_".length;
    const items = [item("bunny_angry"), item("bunny_annoyed")];
    const { view: v, events } = mount(doc, cursor, items);
    await open(v);
    v.dispatch({
      changes: { from: cursor, insert: "an" },
      selection: { anchor: cursor + 2 },
      userEvent: "input.type",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const focus = events.at(-1)!;
    expect(focus.state).toBe("focus");
    expect(focus.changes!.apply(v.state.doc).toString()).toBe(
      "  [[bunny_angry]]\n",
    );
  });

  it("is null for an option the language-server source did not build", async () => {
    const state = EditorState.create({ doc: "x" });
    expect(completionChanges(state, { label: "x" })).toBeNull();
  });
});

describe("the options reported", () => {
  const doc = "  [[bunny_a]]\n";
  const cursor = "  [[bunny_a".length;
  const items = [item("bunny_angry"), item("bunny_annoyed")];
  const inserted = (v: EditorView, e: CompletionPreviewEvent) =>
    e.changes!.apply(v.state.doc).sliceString(0, 20);

  it("are the first highlighted, each new one, and a return to an earlier one", async () => {
    const { view: v, events } = mount(doc, cursor, items);
    await open(v);
    moveCompletionSelection(true)(v);
    moveCompletionSelection(false)(v);
    const focused = events.filter((e) => e.state === "focus");
    expect(focused.map((e) => inserted(v, e))).toEqual([
      "  [[bunny_angry]]\n",
      "  [[bunny_annoyed]]\n",
      "  [[bunny_angry]]\n",
    ]);
    expect(new Set(events.map((e) => e.session)).size).toBe(1);
  });

  it("end with a close that is not an acceptance when the list is dismissed", async () => {
    const { view: v, events } = mount(doc, cursor, items);
    await open(v);
    closeCompletion(v);
    expect(events.at(-1)).toMatchObject({ state: "close" });
    expect(events.at(-1)!.accepted).toBeUndefined();
    expect(v.state.doc.toString()).toBe(doc);
  });

  it("end with a close carrying the accepted edit when an option is accepted", async () => {
    const { view: v, events } = mount(doc, cursor, items);
    await open(v);
    moveCompletionSelection(true)(v);
    const last = events.at(-1)!;
    const before = v.state.doc;
    acceptCompletion(v);
    const close = events.at(-1)!;
    expect(close.state).toBe("close");
    expect(close.accepted).toBeTruthy();
    // Acceptance made exactly the edit the last highlight reported.
    expect(close.accepted!.changes.apply(before).toString()).toBe(
      last.changes!.apply(before).toString(),
    );
    expect(v.state.doc.toString()).toBe("  [[bunny_annoyed]]\n");
  });

  it("end with a close when the editor is destroyed with the list open", async () => {
    const { view: v, events } = mount(doc, cursor, items);
    await open(v);
    const session = events.at(-1)!.session;
    v.destroy();
    expect(events.at(-1)).toMatchObject({ state: "close", session });
    expect(events.at(-1)!.accepted).toBeUndefined();
  });

  it("start a new session each time the list opens", async () => {
    const { view: v, events } = mount(doc, cursor, items);
    await open(v);
    closeCompletion(v);
    await open(v);
    const sessions = events
      .filter((e) => e.state === "focus")
      .map((e) => e.session);
    expect(sessions[0]).not.toBe(sessions.at(-1));
  });
});
