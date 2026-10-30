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

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const URI = "file:///main.sd";

const TRIGGERS = [".", ",", " ", "-", "[", "]", ":", '"', "{", "}"];

type Answer = lsp.CompletionList | lsp.CompletionItem[];

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
  await new Promise((resolve) => setTimeout(resolve, 100));
}

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

  it("closes the list when backspacing deletes across an item's start", async () => {
    const doc = "foobar\n";
    const cursor = "foobar".length;
    const { view } = mount(doc, cursor, [
      {
        label: "foobarb",
        textEdit: { newText: "foobarb", range: range(0, 0, 6) },
      },
      {
        label: "foobarz",
        textEdit: { newText: "barz", range: range(0, 3, 6) },
      },
    ]);
    await open(view);
    const backspace = () => {
      const at = view.state.selection.main.head;
      view.dispatch({
        changes: { from: at - 1, to: at },
        selection: { anchor: at - 1 },
        userEvent: "delete.backward",
      });
    };
    for (let i = 0; i < 3; i++) backspace();
    expect(completionStatus(view.state)).toBe("active");
    const narrow = currentCompletions(view.state).find(
      (c) => c.label === "foobarz",
    );
    expect(narrow).toBeDefined();
    expect(
      completionChanges(view.state, narrow!)?.apply(view.state.doc).toString(),
    ).toBe("foobarz\n");
    backspace();
    expect(view.state.doc.toString()).toBe("fo\n");
    expect(completionStatus(view.state)).toBeNull();
    expect(acceptCompletion(view)).toBe(false);
    expect(view.state.doc.toString()).toBe("fo\n");
  });

  it("applies each item's own range when items name different ranges", async () => {
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
