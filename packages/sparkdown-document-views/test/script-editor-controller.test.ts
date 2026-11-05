import { openSearchPanel } from "@codemirror/search";
import { EditorState, StateEffect, Transaction } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { SelectEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectEditorMessage";
import { ShowEditorProblemsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ShowEditorProblemsMessage";
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

describe("ScriptEditorController problems", () => {
  const show = (controller: TestController, uri: string) =>
    controller["handleShowEditorProblems"]({
      ...ShowEditorProblemsMessage.type.request({ textDocument: { uri } }),
      id: `problems-${nextId++}`,
    } as ShowEditorProblemsMessage.Request);

  it("opens the problems panel for its own document", async () => {
    const { controller, view } = await loadedEditor();
    controller.reveal();
    expect(view.dom.querySelector(".cm-panel-lint")).toBeNull();
    const response = show(controller, "file:///main.sd");
    expect(response).toMatchObject({ result: {} });
    expect(view.dom.querySelector(".cm-panel-lint")).not.toBeNull();
  });

  it("waits for a hidden editor to be revealed before opening the panel", async () => {
    const { controller, view, host } = await loadedEditor();
    const editor = host.firstElementChild as HTMLElement;
    editor.style.visibility = "hidden";
    expect(show(controller, "file:///main.sd")).toMatchObject({ result: {} });
    expect(view.dom.querySelector(".cm-panel-lint")).toBeNull();
    controller.reveal();
    expect(editor.style.visibility).toBe("visible");
    expect(view.dom.querySelector(".cm-panel-lint")).not.toBeNull();
  });

  it("leaves another document's request unanswered", async () => {
    const { controller, view } = await loadedEditor();
    expect(show(controller, "file:///other.sd")).toBeUndefined();
    expect(view.dom.querySelector(".cm-panel-lint")).toBeNull();
  });
});
