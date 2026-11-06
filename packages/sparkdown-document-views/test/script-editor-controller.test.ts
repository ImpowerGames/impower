import { history } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { EditorState, StateEffect, Transaction } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import {
  EditorCommand,
  ExecuteEditorCommandMessage,
} from "@impower/spark-editor-protocol/src/protocols/editor/ExecuteEditorCommandMessage";
import { ChangedEditorHistoryMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorHistoryMessage";
import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { SelectEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectEditorMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  customGotoLinePanel,
  customSearchPanel,
  openCustomGotoLinePanel,
} from "../src/modules/script-editor/utils/extensions/customSearch";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

type Callbacks = {
  onFocus: () => void;
  onBlur: () => void;
  onViewUpdate: (update: ViewUpdate) => void;
};

const created: { view: EditorView; config: Callbacks }[] = [];

vi.mock("../src/modules/script-editor/utils/createEditorView", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    default: (parent: HTMLElement, config: Callbacks) => {
      const view = new EditorView({
        state: EditorState.create({
          doc: "hello world\n",
          extensions: [
            history(),
            customSearchPanel(),
            customGotoLinePanel(),
            EditorView.updateListener.of((update) =>
              config.onViewUpdate(update),
            ),
          ],
        }),
        parent,
      });
      created.push({ view, config });
      return [view, { dispose: () => {} }];
    },
  };
});

const { ScriptEditorController } = await import(
  "../src/modules/script-editor/ScriptEditorController"
);

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

class TestController extends ScriptEditorController {
  loaded: string[] = [];

  override loadTextDocument(
    params: LoadEditorMessage.Request["params"],
  ): void {
    this.loaded.push(params.textDocument.uri);
    super.loadTextDocument(params);
  }

  reveal() {
    this.revealEditor();
  }
}

const hosts: HTMLElement[] = [];

const mount = () => {
  const host = document.body.appendChild(document.createElement("div"));
  hosts.push(host);
  const refs = {
    editor: host.appendChild(document.createElement("div")),
    loading: host.appendChild(document.createElement("div")),
    placeholder: host.appendChild(document.createElement("div")),
    main: host.appendChild(document.createElement("div")),
  };
  const controller = new TestController(host, refs, {
    appearance: ALL_ON_APPEARANCE,
    languageServerWorker: {} as Worker,
    languageServerConnection: {} as never,
  });
  const methods: string[] = [];
  host.addEventListener(MessageProtocol.event, (e) => {
    const message = (e as CustomEvent).detail;
    if (message?.method) {
      methods.push(message.method);
    }
  });
  return { host, controller, methods };
};

let nextId = 0;

const request = (uri: string): LoadEditorMessage.Request =>
  LoadEditorMessage.type.request({
    textDocument: { uri, languageId: "sparkdown", version: 0, text: "" },
    languageServerInitializeParams: {} as never,
    languageServerInitializeResult: {} as never,
  }) as LoadEditorMessage.Request;

const load = (controller: TestController, uri: string) =>
  controller["handleLoadEditor"]({ ...request(uri), id: `load-${nextId++}` });

const loadedEditor = async () => {
  const mounted = mount();
  await load(mounted.controller, "file:///main.sd");
  const { view, config } = created[created.length - 1]!;
  return { ...mounted, view, config };
};

afterEach(() => {
  created.splice(0).forEach(({ view }) => view.destroy());
  hosts.splice(0).forEach((host) => host.remove());
});

describe("ScriptEditorController load", () => {
  it("opens the document without waiting for the script fonts", () => {
    const { controller, methods } = mount();
    const pending = load(controller, "file:///main.sd");
    expect(controller.loaded).toEqual(["file:///main.sd"]);
    expect(methods).toContain("editor/didLoad");
    return pending;
  });

  it("registers no font faces of its own", async () => {
    const add = vi.fn();
    const fonts = Object.getOwnPropertyDescriptor(document, "fonts");
    Object.defineProperty(document, "fonts", { configurable: true, value: { add } });
    try {
      const { controller } = mount();
      await load(controller, "file:///main.sd");
      expect(add).not.toHaveBeenCalled();
    } finally {
      if (fonts) Object.defineProperty(document, "fonts", fonts);
      else delete (document as { fonts?: unknown }).fonts;
    }
  });
});

describe("ScriptEditorController panel focus", () => {
  const openPanel = (
    view: EditorView,
    config: Callbacks,
    open: (view: EditorView) => boolean,
  ) => {
    open(view);
    config.onViewUpdate({ state: view.state, view } as ViewUpdate);
  };

  const field = (host: HTMLElement, selector: string) => {
    const el = host.querySelector<HTMLElement>(selector);
    expect(el).toBeTruthy();
    return el!;
  };

  const unfocusedAfterMovingInto = (
    methods: string[],
    config: Callbacks,
    el: HTMLElement,
  ) => {
    config.onFocus();
    methods.length = 0;
    el.focus();
    el.dispatchEvent(new FocusEvent("focus"));
    config.onBlur();
    return methods.includes("editor/unfocused");
  };

  it("keeps the editor focused when focus moves into the find field", async () => {
    const { host, view, config, methods } = await loadedEditor();
    openPanel(view, config, openSearchPanel);
    const find = field(host, ".cm-search [contenteditable][name='search']");
    expect(unfocusedAfterMovingInto(methods, config, find)).toBe(false);
  });

  it("keeps the editor focused when focus moves into the replace field", async () => {
    const { host, view, config, methods } = await loadedEditor();
    openPanel(view, config, openSearchPanel);
    const find = field(host, ".cm-search [contenteditable][name='search']");
    find.dispatchEvent(new FocusEvent("blur"));
    const replace = field(host, ".cm-search [contenteditable][name='replace']");
    expect(unfocusedAfterMovingInto(methods, config, replace)).toBe(false);
  });

  it("keeps the editor focused when focus moves into the go-to-line field", async () => {
    const { host, view, config, methods } = await loadedEditor();
    openPanel(view, config, openCustomGotoLinePanel);
    const line = field(host, ".cm-gotoLine [contenteditable]");
    expect(unfocusedAfterMovingInto(methods, config, line)).toBe(false);
  });

  it("keeps the editor focused when go-to-line replaces an open find panel", async () => {
    const { host, view, config, methods } = await loadedEditor();
    openPanel(view, config, openSearchPanel);
    field(host, ".cm-search [contenteditable][name='search']").dispatchEvent(
      new FocusEvent("blur"),
    );
    openCustomGotoLinePanel(view);
    expect(host.querySelector(".cm-search")).toBeNull();
    const line = field(host, ".cm-gotoLine [contenteditable]");
    line.dispatchEvent(new FocusEvent("blur"));
    expect(unfocusedAfterMovingInto(methods, config, line)).toBe(false);
  });

  it("keeps the editor focused when find replaces an open go-to-line panel", async () => {
    const { host, view, config, methods } = await loadedEditor();
    openPanel(view, config, openCustomGotoLinePanel);
    field(host, ".cm-gotoLine [contenteditable]").dispatchEvent(
      new FocusEvent("blur"),
    );
    openSearchPanel(view);
    expect(host.querySelector(".cm-gotoLine")).toBeNull();
    const find = field(host, ".cm-search [contenteditable][name='search']");
    find.dispatchEvent(new FocusEvent("blur"));
    expect(unfocusedAfterMovingInto(methods, config, find)).toBe(false);
  });

  it("reports the editor unfocused once focus leaves the find field", async () => {
    const { host, view, config, methods } = await loadedEditor();
    openPanel(view, config, openSearchPanel);
    const find = field(host, ".cm-search [contenteditable][name='search']");
    find.dispatchEvent(new FocusEvent("blur"));
    config.onFocus();
    methods.length = 0;
    config.onBlur();
    expect(methods).toContain("editor/unfocused");
  });
});

describe("ScriptEditorController select", () => {
  const selections = (view: EditorView) => {
    const events: (string | undefined)[] = [];
    view.dispatch({
      effects: StateEffect.appendConfig.of(
        EditorView.updateListener.of((update) => {
          if (update.selectionSet) {
            events.push(
              update.transactions
                .map((tr) => tr.annotation(Transaction.userEvent))
                .find(Boolean),
            );
          }
        }),
      ),
    });
    return events;
  };

  const select = (controller: TestController, line: number, userEvent?: boolean) =>
    controller["handleSelectEditor"](
      SelectEditorMessage.type.notification({
        textDocument: { uri: "file:///main.sd" },
        range: {
          start: { line, character: 0 },
          end: { line, character: 0 },
        },
        userEvent,
      }),
    );

  it("marks a selection the editor asked for as the user's only when it says so", async () => {
    const { controller, view } = await loadedEditor();
    view.dispatch({ changes: { from: view.state.doc.length, insert: "second\n" } });
    const events = selections(view);
    select(controller, 1, true);
    select(controller, 0);
    expect(events).toEqual(["select", undefined]);
    expect(view.state.selection.main.head).toBe(0);
  });
});

describe("ScriptEditorController commands", () => {
  const run = (
    controller: TestController,
    command: EditorCommand,
    uri = "file:///main.sd",
  ) =>
    controller["handleExecuteEditorCommand"]({
      ...ExecuteEditorCommandMessage.type.request({
        textDocument: { uri },
        command,
      }),
      id: `command-${nextId++}`,
    });

  it("indents and dedents the caret's line for the writer's bar", async () => {
    const { controller, view } = await loadedEditor();
    expect(run(controller, "indent")).toMatchObject({ result: { ran: true } });
    expect(view.state.doc.line(1).text).toMatch(/^\s+hello world$/);
    expect(run(controller, "dedent")).toMatchObject({ result: { ran: true } });
    expect(view.state.doc.line(1).text).toBe("hello world");
  });

  it("opens Go to line, find and the problems panel inside the editor", async () => {
    const { controller, host } = await loadedEditor();
    run(controller, "gotoLine");
    expect(host.querySelector(".cm-gotoLine")).not.toBeNull();
    run(controller, "search");
    expect(host.querySelector(".cm-search")).not.toBeNull();
    run(controller, "problems");
    expect(host.querySelector(".cm-panel-lint")).not.toBeNull();
  });

  it("undoes and redoes the script's edits and reports what it can undo and redo", async () => {
    const { controller, view, host } = await loadedEditor();
    const reported: [string, boolean, boolean][] = [];
    host.addEventListener(MessageProtocol.event, (e) => {
      const message = (e as CustomEvent).detail;
      if (ChangedEditorHistoryMessage.type.is(message)) {
        const { textDocument, canUndo, canRedo } = message.params;
        reported.push([textDocument.uri, canUndo, canRedo]);
      }
    });
    view.dispatch({
      changes: { from: 0, insert: "> " },
      userEvent: "input.type",
    });
    expect(reported).toEqual([["file:///main.sd", true, false]]);
    expect(run(controller, "undo")).toMatchObject({ result: { ran: true } });
    expect(view.state.doc.line(1).text).toBe("hello world");
    expect(reported.at(-1)).toEqual(["file:///main.sd", false, true]);
    expect(run(controller, "redo")).toMatchObject({ result: { ran: true } });
    expect(view.state.doc.line(1).text).toBe("> hello world");
    expect(reported.at(-1)).toEqual(["file:///main.sd", true, false]);
    expect(reported).toHaveLength(3);
  });

  it("leaves a command for another document to that document's editor", async () => {
    const { controller, view, host } = await loadedEditor();
    expect(run(controller, "indent", "file:///other.sd")).toBeUndefined();
    expect(run(controller, "gotoLine", "file:///other.sd")).toBeUndefined();
    expect(view.state.doc.line(1).text).toBe("hello world");
    expect(host.querySelector(".cm-gotoLine")).toBeNull();
  });
});
