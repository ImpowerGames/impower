// Accepting a language-server completion replaces the range the server's edit
// names (I-1338). The client used to start the replaced range where its own
// trigger-character pattern stopped matching before the cursor and end it at
// the cursor, so a label holding a trigger character (`-`, `.`) was inserted
// after the text it should have replaced, and an accept in the middle of a
// token left the token's tail behind. The highlighted option's preview must
// report the same edit acceptance makes.
import {
  acceptCompletion,
  completionStatus,
  currentCompletions,
  startCompletion,
} from "@codemirror/autocomplete";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  completionChanges,
  LSPClient,
  serverCompletions,
} from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, describe, expect, it } from "vitest";
import type * as lsp from "vscode-languageserver-protocol";

// The editors here live long enough for CodeMirror's measure frame, which asks
// jsdom for text rectangles it does not implement. An empty list is what a
// layout engine that does no layout would answer, and CodeMirror handles it.
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const URI = "file:///main.sd";

// The trigger characters the Sparkdown language server declares, in part:
// enough that `-`, `.` and `:` each restart the client's own word.
const TRIGGERS = [".", ",", " ", "-", "[", "]", ":", '"', "{", "}"];

type Answer = lsp.CompletionList | lsp.CompletionItem[];

/** A server that answers every completion request with `answer`. */
class StandInServer {
  handler?: (value: object) => void;
  completions: lsp.CompletionParams[] = [];
  constructor(public answer: Answer) {}
  send(message: string) {
    const m = JSON.parse(message);
    if (!("id" in m && "method" in m)) return;
    let result: unknown = null;
    if (m.method === "textDocument/completion") {
      this.completions.push(m.params);
      result = this.answer;
    }
    queueMicrotask(() => this.handler?.({ jsonrpc: "2.0", id: m.id, result }));
  }
  subscribe(handler: (value: object) => void) {
    this.handler = handler;
  }
  unsubscribe() {}
}

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

function mount(doc: string, cursor: number | EditorSelection, answer: Answer) {
  const server = new StandInServer(answer);
  const client = new LSPClient({
    extensions: [serverCompletions({ override: true })],
  }).connect(server, undefined, {
    capabilities: {
      textDocumentSync: 2,
      completionProvider: { triggerCharacters: TRIGGERS },
    },
  });
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection:
        typeof cursor === "number" ? EditorSelection.cursor(cursor) : cursor,
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        client.plugin({ uri: URI, version: 0 }),
      ],
    }),
    parent: document.body.appendChild(document.createElement("div")),
  });
  views.push(view);
  return { view, server };
}

/** Open the list and wait until it shows options. */
async function open(view: EditorView) {
  startCompletion(view);
  await settle(view);
}

async function settle(view: EditorView) {
  for (
    let i = 0;
    i < 200 &&
    (completionStatus(view.state) !== "active" ||
      currentCompletions(view.state).length === 0);
    i++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(completionStatus(view.state)).toBe("active");
  // CodeMirror ignores accepting for its interaction delay (75ms) after the
  // list opens.
  await new Promise((resolve) => setTimeout(resolve, 100));
}

/** Type `text` at every cursor the way a keystroke does. */
function type(view: EditorView, text: string) {
  view.dispatch(
    view.state.changeByRange((r) => ({
      changes: { from: r.head, insert: text },
      range: EditorSelection.cursor(r.head + text.length),
    })),
    { userEvent: "input.type" },
  );
}

const range = (line: number, start: number, end: number): lsp.Range => ({
  start: { line, character: start },
  end: { line, character: end },
});

/** The document after accepting the highlighted option, and the document its
 *  preview reported just before. */
function accept(view: EditorView) {
  const highlighted = currentCompletions(view.state)[0];
  expect(highlighted).toBeDefined();
  const preview = completionChanges(view.state, highlighted!)
    ?.apply(view.state.doc)
    .toString();
  expect(acceptCompletion(view)).toBe(true);
  return { accepted: view.state.doc.toString(), preview };
}

describe("accepting a language-server completion", () => {
  it("replaces the server's range when the label holds a trigger character", async () => {
    // `[[mia:far-|]]`: the server's edit covers `far-`, from just after the
    // colon. The client's own word restarts after the hyphen.
    const doc = "[[mia:far-]]\n";
    const cursor = "[[mia:far-".length;
    const { view } = mount(doc, cursor, [
      {
        label: "far-left",
        textEdit: { newText: "far-left", range: range(0, 6, 10) },
      },
    ]);
    await open(view);
    expect(currentCompletions(view.state).map((c) => c.label)).toEqual([
      "far-left",
    ]);
    const { accepted, preview } = accept(view);
    expect(accepted).toBe("[[mia:far-left]]\n");
    expect(preview).toBe(accepted);
  });

  it("replaces the whole token when accepted mid-token", async () => {
    // `"ne|ar"`: the server's edit covers the whole token inside the quotes.
    const doc = 'x = { "hat", "near" }\n';
    const cursor = 'x = { "hat", "ne'.length;
    const { view } = mount(doc, cursor, [
      {
        label: "near",
        textEdit: { newText: "near", range: range(0, 14, 18) },
      },
    ]);
    await open(view);
    const { accepted, preview } = accept(view);
    expect(accepted).toBe('x = { "hat", "near" }\n');
    expect(preview).toBe(accepted);
  });

  it("replaces the list's default edit range for items without their own", async () => {
    const doc = "[[mia:look.fa]]\n";
    const cursor = "[[mia:look.fa".length;
    const { view } = mount(doc, cursor, {
      isIncomplete: false,
      itemDefaults: { editRange: range(0, 6, 13) },
      items: [{ label: "look.far-left" }],
    });
    await open(view);
    const { accepted, preview } = accept(view);
    expect(accepted).toBe("[[mia:look.far-left]]\n");
    expect(preview).toBe(accepted);
  });

  it("keeps the server's range while typing narrows the list", async () => {
    // The list opened on `far` and the author typed `-l` before accepting:
    // the replaced range grows with what was typed, and a label holding the
    // typed hyphen still matches.
    const doc = "[[mia:far]]\n";
    const cursor = "[[mia:far".length;
    const { view, server } = mount(doc, cursor, [
      {
        label: "far-left",
        textEdit: { newText: "far-left", range: range(0, 6, 9) },
      },
      { label: "near", textEdit: { newText: "near", range: range(0, 6, 9) } },
    ]);
    await open(view);
    // The server answers the request typing the hyphen makes with the range
    // as it now stands.
    server.answer = [
      {
        label: "far-left",
        textEdit: { newText: "far-left", range: range(0, 6, 10) },
      },
    ];
    type(view, "-");
    await settle(view);
    type(view, "l");
    await settle(view);
    expect(currentCompletions(view.state).map((c) => c.label)).toEqual([
      "far-left",
    ]);
    const { accepted, preview } = accept(view);
    expect(accepted).toBe("[[mia:far-left]]\n");
    expect(preview).toBe(accepted);
  });

  it("places a snippet over the server's range", async () => {
    const doc = "  de-\n";
    const cursor = "  de-".length;
    const { view } = mount(doc, cursor, [
      {
        label: "de-fine",
        insertTextFormat: 2,
        textEdit: { newText: "de-fine ${1:name}", range: range(0, 2, 5) },
      },
    ]);
    await open(view);
    const { accepted, preview } = accept(view);
    expect(accepted).toBe("  de-fine name\n");
    expect(preview).toBe(accepted);
  });

  it("still replaces the word before the cursor for an item with no edit range", async () => {
    const doc = "[[mia:ha]]\n";
    const cursor = "[[mia:ha".length;
    const { view } = mount(doc, cursor, [{ label: "hat" }]);
    await open(view);
    const { accepted, preview } = accept(view);
    expect(accepted).toBe("[[mia:hat]]\n");
    expect(preview).toBe(accepted);
  });

  it("filters on the text before the cursor, not the suffix it will replace", async () => {
    // `[[mia:far-|right]]`: the server offers `far-left` for the prefix
    // `far-` and replaces the whole `far-right` token. The old suffix must
    // not hide the offered choice.
    const doc = "[[mia:far-right]]\n";
    const cursor = "[[mia:far-".length;
    const { view } = mount(doc, cursor, [
      {
        label: "far-left",
        textEdit: { newText: "far-left", range: range(0, 6, 15) },
      },
    ]);
    await open(view);
    expect(currentCompletions(view.state).map((c) => c.label)).toEqual([
      "far-left",
    ]);
    const { accepted, preview } = accept(view);
    expect(accepted).toBe("[[mia:far-left]]\n");
    expect(preview).toBe(accepted);
  });

  // Typing at a second cursor moves the main cursor's range without moving
  // the list's anchors, so the list is asked for again with the server's
  // ranges for the document as it then stands, and the preview and
  // acceptance agree on them.
  for (const c of [
    {
      name: "on another line",
      doc: "ha\nha\n",
      cursors: [2, 5],
      before: range(1, 0, 2),
      after: range(1, 0, 3),
      typed: "hat\nhat\n",
      expected: "hatch\nhatch\n",
    },
    {
      name: "earlier on the same line",
      doc: "  ha ha\n",
      cursors: [4, 7],
      before: range(0, 5, 7),
      after: range(0, 6, 9),
      typed: "  hat hat\n",
      expected: "  hatch hatch\n",
    },
  ]) {
    it(`asks again after typing at a second cursor ${c.name}`, async () => {
      const item = (r: lsp.Range): lsp.CompletionItem[] => [
        { label: "hatch", textEdit: { newText: "hatch", range: r } },
      ];
      const { view, server } = mount(
        c.doc,
        EditorSelection.create(
          c.cursors.map((p) => EditorSelection.cursor(p)),
          c.cursors.length - 1,
        ),
        item(c.before),
      );
      await open(view);
      const asked = server.completions.length;
      server.answer = item(c.after);
      type(view, "t");
      await settle(view);
      expect(view.state.doc.toString()).toBe(c.typed);
      expect(server.completions.length).toBe(asked + 1);
      const { accepted, preview } = accept(view);
      expect(accepted).toBe(c.expected);
      expect(preview).toBe(accepted);
    });
  }

  // An edit that is not typing at the end of the list's word, such as one a
  // host or a collaborator dispatches, would move an item's range without
  // moving the list's anchors: the list closes rather than replace the wrong
  // text.
  for (const c of [
    {
      name: "the suffix an item replaces",
      doc: '"near"\n',
      cursor: 3,
      edit: { from: 4, to: 5 },
      edited: '"nea"\n',
      items: [
        { label: "near", textEdit: { newText: "near", range: range(0, 1, 5) } },
      ],
    },
    {
      name: "text before the word",
      doc: "  ha\n",
      cursor: 4,
      edit: { from: 0, insert: "x" },
      edited: "x  ha\n",
      items: [
        { label: "hat", textEdit: { newText: "hat", range: range(0, 2, 4) } },
      ],
    },
  ]) {
    it(`closes the list when another edit changes ${c.name}`, async () => {
      const { view } = mount(c.doc, c.cursor, c.items);
      await open(view);
      view.dispatch({ changes: c.edit });
      expect(completionStatus(view.state)).toBeNull();
      expect(acceptCompletion(view)).toBe(false);
      expect(view.state.doc.toString()).toBe(c.edited);
    });
  }

  it("replaces the list's word for an item without a range beside items with one", async () => {
    // The list filters on the server's word `look.ha`, so an item without a
    // range is shown only when its label continues that word, and it
    // replaces that word rather than the text after the dot.
    const doc = "[[mia:look.ha]]\n";
    const cursor = "[[mia:look.ha".length;
    const { view } = mount(doc, cursor, [
      { label: "look.hat" },
      {
        label: "look.happy",
        textEdit: { newText: "look.happy", range: range(0, 6, 13) },
      },
    ]);
    await open(view);
    const { accepted, preview } = accept(view);
    expect(accepted).toBe("[[mia:look.hat]]\n");
    expect(preview).toBe(accepted);
  });

  it("applies each item's own range when items name different ranges", async () => {
    // One item replaces `far-` after the colon; the other replaces only the
    // text after the hyphen, as the server may send for a different kind of
    // item.
    const doc = "[[mia:far-]]\n";
    const cursor = "[[mia:far-".length;
    const answer = (first: string): lsp.CompletionItem[] => {
      const wide: lsp.CompletionItem = {
        label: "far-left",
        textEdit: { newText: "far-left", range: range(0, 6, 10) },
      };
      const narrow: lsp.CompletionItem = {
        label: "far-right",
        filterText: "far-right",
        textEdit: { newText: "right", range: range(0, 10, 10) },
      };
      return first === "wide" ? [wide, narrow] : [narrow, wide];
    };
    for (const [first, expected] of [
      ["wide", "[[mia:far-left]]\n"],
      ["narrow", "[[mia:far-right]]\n"],
    ] as const) {
      const { view } = mount(doc, cursor, answer(first));
      await open(view);
      const { accepted, preview } = accept(view);
      expect(accepted).toBe(expected);
      expect(preview).toBe(accepted);
    }
  });
});
