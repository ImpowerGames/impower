import type { PreviewCompletionParams } from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewCompletionMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextChange } from "../src/completion/completionEdits";
import type { FakeVscode } from "./fakeVscode";

const state = vi.hoisted(() => ({
  vscode: null as unknown as FakeVscode,
  manager: null as unknown as {
    canPreviewCompletions: boolean;
    sent: PreviewCompletionParams[];
    notifyPreviewCompletion: (params: PreviewCompletionParams) => void;
    disposed: { fire: (v: void) => void };
    connected: { fire: (v: void) => void };
    onDidDisposePanel: unknown;
    onDidConnectPanel: unknown;
  },
}));

vi.mock("vscode", async () => {
  const { fakeVscode } = await import("./fakeVscode");
  state.vscode = fakeVscode();
  return state.vscode;
});

vi.mock("../src/managers/SparkdownPreviewGamePanelManager", async () => {
  const { EventEmitter } = await import("./fakeVscode");
  const disposed = new EventEmitter<void>();
  const connected = new EventEmitter<void>();
  state.manager = {
    canPreviewCompletions: true,
    sent: [],
    notifyPreviewCompletion(params) {
      this.sent.push(params);
    },
    disposed,
    connected,
    onDidDisposePanel: disposed.event,
    onDidConnectPanel: connected.event,
  };
  return { SparkdownPreviewGamePanelManager: { instance: state.manager } };
});

const TRIGGER = "editor.action.inlineSuggest.trigger";
const URI = "file:///project/main.sd";
const TEXT = ["scene START", "  [[mia_]]", "  [[mia_]]", "end"].join("\n");

/** Loads a fresh copy of the module and activates it, as the extension does. */
const activate = async () => {
  vi.resetModules();
  // The stand-ins outlive `resetModules`; start each test from nothing, so no
  // copy of the module loaded by an earlier test hears anything.
  await import("vscode");
  await import("../src/managers/SparkdownPreviewGamePanelManager");
  for (const emitter of Object.values(state.vscode.emitters)) {
    emitter.dispose();
  }
  state.vscode.registered.inlineProviders.length = 0;
  state.vscode.commands.executed.length = 0;
  state.manager.sent = [];
  state.manager.canPreviewCompletions = true;
  (state.manager.disposed as { dispose?: () => void }).dispose?.();
  (state.manager.connected as { dispose?: () => void }).dispose?.();
  const module = await import("../src/utils/activateCompletionPreview");
  const { document, editor, Position, Range, Selection } =
    await import("./fakeVscode");
  const context = { subscriptions: [] as { dispose: () => unknown }[] };
  module.activateCompletionPreview(context as never);
  const vscode = state.vscode;
  const manager = state.manager;
  const doc = document(URI, TEXT, 3);
  const at = (line: number, character: number) =>
    new vscode.Position(line, character);
  const cursor = (line: number, character: number) =>
    new vscode.Selection(at(line, character), at(line, character));
  const mainEditor = editor(doc, [cursor(1, 6)]);
  vscode.window.activeTextEditor = mainEditor;
  vscode.window.visibleTextEditors = [mainEditor];
  const provider = vscode.registered.inlineProviders[0]!.provider;
  /** An item as the language client converts it: replaces `mia_`. */
  const item = (insertText: string, extra: object = {}) => ({
    label: insertText,
    insertText,
    range: new vscode.Range(at(1, 4), at(1, 8)),
    ...extra,
  });
  /** VS Code asks the inline provider, with `text` highlighted or nothing. */
  const report = (text?: string, position = at(1, 6)) =>
    provider.provideInlineCompletionItems(doc, position, {
      selectedCompletionInfo: text
        ? { range: new vscode.Range(at(1, 4), at(1, 6)), text }
        : undefined,
    });
  const triggers = () =>
    vscode.commands.executed.filter((c) => c.command === TRIGGER).length;
  void Position;
  void Range;
  void Selection;
  return {
    module,
    context,
    vscode,
    manager,
    doc,
    at,
    cursor,
    mainEditor,
    item,
    report,
    triggers,
  };
};

const summary = (sent: PreviewCompletionParams[]) =>
  sent.map((p) =>
    p.state === "focus"
      ? `focus ${p.session} ${(p.contentChanges as TextChange[] | null | undefined)?.map((c) => `${c.range.start.line}:${c.range.start.character}-${c.range.end.character}=${c.text}`).join(" + ") ?? "null"}`
      : `close ${p.session}${p.accepted ? " accepted" : ""}`,
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("the completion preview in the extension", () => {
  it("is registered as an inline provider for Sparkdown that never offers inline text", async () => {
    const { vscode, report, module, doc, item } = await activate();
    expect(vscode.registered.inlineProviders).toHaveLength(1);
    expect(vscode.registered.inlineProviders[0]!.selector).toEqual({
      language: "sparkdown",
    });
    module.offerCompletions(doc as never, [item("mia_sad")] as never);
    expect(report("mia_sad")).toEqual([]);
    expect(report()).toEqual([]);
  });

  it("turns on VS Code's highlight reports when the language server offers suggestions", async () => {
    const { module, doc, item, triggers, manager } = await activate();
    module.offerCompletions(doc as never, [item("mia_sad")] as never);
    expect(triggers()).toBe(1);
    // An empty answer puts nothing in a list; other inline providers are
    // not asked for nothing.
    module.offerCompletions(doc as never, [] as never);
    expect(triggers()).toBe(1);
    manager.canPreviewCompletions = false;
    module.offerCompletions(doc as never, [item("mia_sad")] as never);
    expect(triggers()).toBe(1);
  });

  it("sends each highlight with its edit, and the close, to the preview", async () => {
    const { module, doc, item, report, manager } = await activate();
    module.offerCompletions(
      doc as never,
      [item("mia_happy"), item("mia_sad")] as never,
    );
    report("mia_happy");
    report("mia_sad");
    report("mia_happy");
    report();
    expect(summary(manager.sent)).toEqual([
      "focus 1 1:4-6=mia_happy",
      "focus 1 1:4-6=mia_sad",
      "focus 1 1:4-6=mia_happy",
      "close 1",
    ]);
    expect(manager.sent[0]).toMatchObject({
      textDocument: { uri: URI, version: 3 },
      selectedRange: { start: { line: 1, character: 6 } },
    });
  });

  it("reports acceptance from the document change it makes", async () => {
    const { module, doc, item, report, manager, vscode, at } = await activate();
    module.offerCompletions(doc as never, [item("mia_sad")] as never);
    report("mia_sad");
    vscode.emitters.changeTextDocument.fire({
      document: { ...doc, version: 4 },
      contentChanges: [
        { range: new vscode.Range(at(1, 4), at(1, 6)), text: "mia_sad" },
      ],
    });
    expect(summary(manager.sent)).toEqual([
      "focus 1 1:4-6=mia_sad",
      "close 1 accepted",
    ]);
  });

  it("previews what accepting inserts at every cursor", async () => {
    const { module, doc, item, report, manager, vscode, cursor } =
      await activate();
    const both = { ...vscode.window.activeTextEditor };
    both.selections = [cursor(1, 6), cursor(2, 6)];
    both.selection = both.selections[0];
    vscode.window.visibleTextEditors = [both];
    module.offerCompletions(doc as never, [item("mia_sad")] as never);
    report("mia_sad");
    expect(summary(manager.sent)).toEqual([
      "focus 1 2:4-6=mia_sad + 1:4-6=mia_sad",
    ]);
  });

  it("asks VS Code again while a list is open, and stops once it closes", async () => {
    vi.useFakeTimers();
    const { module, doc, item, report, triggers } = await activate();
    module.offerCompletions(doc as never, [item("mia_sad")] as never);
    report("mia_sad");
    expect(triggers()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(triggers()).toBe(3);
    report();
    vi.advanceTimersByTime(2000);
    expect(triggers()).toBe(3);
  });

  it("closes the list on a click in the text, another editor or a closed document", async () => {
    const { module, doc, item, report, manager, vscode } = await activate();
    module.offerCompletions(doc as never, [item("mia_sad")] as never);
    report("mia_sad");
    vscode.emitters.changeTextEditorSelection.fire({
      kind: vscode.TextEditorSelectionChangeKind.Keyboard,
      textEditor: vscode.window.activeTextEditor,
    });
    vscode.emitters.changeTextEditorSelection.fire({
      kind: vscode.TextEditorSelectionChangeKind.Mouse,
      textEditor: vscode.window.activeTextEditor,
    });
    report("mia_sad");
    vscode.emitters.changeActiveTextEditor.fire(undefined);
    vscode.emitters.changeActiveTextEditor.fire(vscode.window.activeTextEditor);
    report("mia_sad");
    vscode.emitters.closeTextDocument.fire(doc);
    expect(summary(manager.sent)).toEqual([
      "focus 1 1:4-6=mia_sad",
      "close 1",
      "focus 2 1:4-6=mia_sad",
      "close 2",
      "focus 3 1:4-6=mia_sad",
      "close 3",
    ]);
  });

  it("sends the highlight again to a preview that reloaded", async () => {
    const { module, doc, item, report, manager } = await activate();
    module.offerCompletions(doc as never, [item("mia_sad")] as never);
    report("mia_sad");
    manager.connected.fire();
    expect(summary(manager.sent)).toEqual([
      "focus 1 1:4-6=mia_sad",
      "focus 1 1:4-6=mia_sad",
    ]);
    expect(manager.sent[1]!.request).toBeGreaterThan(manager.sent[0]!.request);
  });

  it("forgets an open list when the preview closes", async () => {
    const { module, doc, item, report, manager } = await activate();
    module.offerCompletions(doc as never, [item("mia_sad")] as never);
    report("mia_sad");
    manager.disposed.fire();
    report();
    expect(summary(manager.sent)).toEqual(["focus 1 1:4-6=mia_sad"]);
  });

  it("sends nothing while the preview cannot show suggestions", async () => {
    const { report, manager } = await activate();
    manager.canPreviewCompletions = false;
    report("mia_sad");
    report();
    expect(manager.sent).toEqual([]);
  });

  it("reports the highlight again when resolving an item adds edits", async () => {
    const { module, doc, item, report, manager, vscode, at } = await activate();
    const offered = item("mia_sad");
    module.offerCompletions(doc as never, [offered] as never);
    report("mia_sad");
    module.resolvedCompletion(
      offered as never,
      {
        ...offered,
        additionalTextEdits: [
          {
            range: new vscode.Range(at(0, 0), at(0, 0)),
            newText: "include mia\n",
          },
        ],
      } as never,
    );
    expect(summary(manager.sent)).toEqual([
      "focus 1 1:4-6=mia_sad",
      "focus 1 1:4-6=mia_sad + 0:0-0=include mia\n",
    ]);
  });

  it("matches snippet items by the text they insert", async () => {
    const { module, doc, item, report, manager, vscode } = await activate();
    module.offerCompletions(
      doc as never,
      [
        item("", { insertText: new vscode.SnippetString("mia_${1:sad}") }),
      ] as never,
    );
    report("mia_sad");
    expect(summary(manager.sent)).toEqual(["focus 1 1:4-6=mia_sad"]);
  });
});
