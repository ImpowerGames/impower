import { history } from "@codemirror/commands";
import { Compartment, EditorState, StateEffect, Transaction } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import {
  EditorCommand,
  ExecuteEditorCommandMessage,
} from "@impower/spark-editor-protocol/src/protocols/editor/ExecuteEditorCommandMessage";
import { ChangedEditorHistoryMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorHistoryMessage";
import { ChangedEditorWithheldDiagnosticMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorWithheldDiagnosticMessage";
import {
  serverDiagnostics,
  withholdDiagnostic,
} from "@impower/codemirror-vscode-lsp-client/src/diagnostics";
import {
  getDocumentVersion,
  versioning,
} from "@impower/codemirror-vscode-lsp-client/src/version";
import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { SelectEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectEditorMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ScrolledPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  customGotoLinePanel,
  openCustomGotoLinePanel,
} from "../src/modules/script-editor/utils/extensions/gotoLinePanel";
import { getScrollableParent } from "../src/utils/getScrollableParent";
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
            (actual["readOnlyConfig"] as Compartment).of(
              EditorState.readOnly.of(false),
            ),
            (actual["editableConfig"] as Compartment).of(
              EditorView.editable.of(true),
            ),
            history(),
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
  scrolls: unknown[] = [];
  settles = 0;

  protected override settleSelection(
    ...args: Parameters<InstanceType<typeof ScriptEditorController>["settleSelection"]>
  ) {
    this.settles += 1;
    super.settleSelection(...args);
  }

  protected override scrollToRange(
    ...args: Parameters<InstanceType<typeof ScriptEditorController>["scrollToRange"]>
  ) {
    this.scrolls.push(args[0]);
    super.scrollToRange(...args);
  }

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

  it("keeps the editor focused when focus moves into the go-to-line field", async () => {
    const { host, view, config, methods } = await loadedEditor();
    openPanel(view, config, openCustomGotoLinePanel);
    const line = field(host, ".cm-gotoLine [contenteditable]");
    expect(unfocusedAfterMovingInto(methods, config, line)).toBe(false);
  });

  it("reports the editor unfocused once focus leaves the go-to-line field", async () => {
    const { host, view, config, methods } = await loadedEditor();
    openPanel(view, config, openCustomGotoLinePanel);
    const line = field(host, ".cm-gotoLine [contenteditable]");
    line.dispatchEvent(new FocusEvent("blur"));
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

describe("ScriptEditorController initial selection", () => {
  it("puts the caret where the load asked once the editor settles, even with that line on screen", async () => {
    const mounted = mount();
    const at = { line: 1, character: 2 };
    await mounted.controller["handleLoadEditor"]({
      ...LoadEditorMessage.type.request({
        textDocument: { uri: "file:///main.sd", languageId: "sparkdown", version: 0, text: "" },
        selectedRange: { start: at, end: at },
        languageServerInitializeParams: {} as never,
        languageServerInitializeResult: {} as never,
      }),
      id: `load-${nextId++}`,
    } as LoadEditorMessage.Request);
    const { view } = created[created.length - 1]!;
    view.dispatch({ changes: { from: view.state.doc.length, insert: "second line\n" } });
    expect(view.state.selection.main.head).toBe(0);
    mounted.controller["handleIdle"]();
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from + 2);
  });
});

describe("ScriptEditorController initial selection after newer moves", () => {
  const loadAt = async (line: number) => {
    const mounted = mount();
    const at = { line, character: 0 };
    await mounted.controller["handleLoadEditor"]({
      ...LoadEditorMessage.type.request({
        textDocument: { uri: "file:///main.sd", languageId: "sparkdown", version: 0, text: "" },
        selectedRange: { start: at, end: at },
        languageServerInitializeParams: {} as never,
        languageServerInitializeResult: {} as never,
      }),
      id: `load-${nextId++}`,
    } as LoadEditorMessage.Request);
    const { view } = created[created.length - 1]!;
    view.dispatch({
      changes: { from: view.state.doc.length, insert: "second\nthird\nfourth\n" },
    });
    return { ...mounted, view };
  };

  it("keeps a navigation that arrived before the editor settled", async () => {
    const { controller, view } = await loadAt(1);
    controller["handleSelectEditor"](
      SelectEditorMessage.type.notification({
        textDocument: { uri: "file:///main.sd" },
        range: { start: { line: 3, character: 0 }, end: { line: 3, character: 0 } },
      }),
    );
    const moved = view.state.doc.line(4).from;
    expect(view.state.selection.main.head).toBe(moved);
    controller["handleIdle"]();
    expect(view.state.selection.main.head).toBe(moved);
  });

  it("keeps a navigation to the starting position that arrived before the editor settled", async () => {
    const { controller, view } = await loadAt(3);
    controller["handleSelectEditor"](
      SelectEditorMessage.type.notification({
        textDocument: { uri: "file:///main.sd" },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      }),
    );
    expect(view.state.selection.main.head).toBe(0);
    controller["handleIdle"]();
    expect(view.state.selection.main.head).toBe(0);
  });

  it("keeps a selection moved away and back to the start before the editor settled", async () => {
    const { controller, view } = await loadAt(3);
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from }, userEvent: "select.pointer" });
    view.dispatch({ selection: { anchor: 0 }, userEvent: "select.pointer" });
    controller["handleIdle"]();
    expect(view.state.selection.main.head).toBe(0);
  });

  it("still settles when only the text changed before the editor settled", async () => {
    const { controller, view } = await loadAt(3);
    view.dispatch({ changes: { from: view.state.doc.length, insert: "fifth\n" } });
    controller["handleIdle"]();
    expect(view.state.selection.main.head).toBe(view.state.doc.line(4).from);
  });

  it("keeps a selection the author made before the editor settled", async () => {
    const { controller, view } = await loadAt(1);
    const clicked = view.state.doc.line(3).from + 1;
    view.dispatch({ selection: { anchor: clicked }, userEvent: "select.pointer" });
    controller["handleIdle"]();
    expect(view.state.selection.main.head).toBe(clicked);
  });
});

describe("ScriptEditorController load handover", () => {
  const at = (line: number) => ({
    start: { line, character: 0 },
    end: { line, character: 0 },
  });

  const loadAt = async (
    line: number,
    visibleRange?: ReturnType<typeof at>,
    focused?: boolean,
  ) => {
    const mounted = mount();
    await mounted.controller["handleLoadEditor"]({
      ...LoadEditorMessage.type.request({
        textDocument: { uri: "file:///main.sd", languageId: "sparkdown", version: 0, text: "" },
        selectedRange: at(line),
        visibleRange,
        focused,
        languageServerInitializeParams: {} as never,
        languageServerInitializeResult: {} as never,
      }),
      id: `load-${nextId++}`,
    } as LoadEditorMessage.Request);
    const { view } = created[created.length - 1]!;
    view.dispatch({
      changes: { from: view.state.doc.length, insert: "second\nthird\nfourth\n" },
    });
    return { ...mounted, view };
  };

  const jump = (controller: TestController, line: number) =>
    controller["handleSelectEditor"](
      SelectEditorMessage.type.notification({
        textDocument: { uri: "file:///main.sd" },
        range: at(line),
        scrollIntoView: "center",
      }),
    );

  it("keeps a jump that arrived while the editor waited for its fonts", async () => {
    const fonts = Object.getOwnPropertyDescriptor(document, "fonts");
    let ready: () => void = () => {};
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { status: "loading", ready: new Promise<void>((resolve) => (ready = resolve)) },
    });
    try {
      const { controller, view } = await loadAt(1);
      controller["handleViewportParsed"]();
      jump(controller, 3);
      ready();
      await Promise.resolve();
      await Promise.resolve();
      expect(controller["_loaded"]).toBe(true);
      expect(view.state.selection.main.head).toBe(view.state.doc.line(4).from);
    } finally {
      if (fonts) Object.defineProperty(document, "fonts", fonts);
      else delete (document as { fonts?: unknown }).fonts;
    }
  });

  it("keeps the scroll of a jump that arrived before the editor settled", async () => {
    const { controller, view } = await loadAt(1, at(1));
    jump(controller, 3);
    controller["handleIdle"]();
    expect(controller.scrolls).toEqual([]);
    expect(view.state.selection.main.head).toBe(view.state.doc.line(4).from);
  });

  it("keeps a wheel scroll the author made before the editor settled", async () => {
    const { controller, host, view } = await loadAt(1, at(1));
    controller.setup();
    try {
      view.contentDOM.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
      controller["handleIdle"]();
      expect(controller.scrolls).toEqual([]);
      expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from);
    } finally {
      controller.dispose();
      host.remove();
    }
  });

  it("keeps a scrollbar drag the author made before the editor settled", async () => {
    const { controller, host, view } = await loadAt(1, at(1));
    host.style.overflowY = "auto";
    controller.setup();
    try {
      getScrollableParent(view.scrollDOM).dispatchEvent(
        new Event("pointerdown", { bubbles: true }),
      );
      controller["handleIdle"]();
      expect(controller.scrolls).toEqual([]);
    } finally {
      controller.dispose();
      host.remove();
    }
  });

  it("leaves focus where the author moved it while the editor was loading", async () => {
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { controller, host, view } = await loadAt(1, undefined, true);
    controller.setup();
    const input = document.body.appendChild(document.createElement("input"));
    try {
      input.focus();
      controller["handleIdle"]();
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(document.activeElement).toBe(input);
      expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from);
    } finally {
      hasFocus.mockRestore();
      clearInterval(controller["_focusIntervalTimeout"]);
      controller.dispose();
      input.remove();
      host.remove();
    }
  });

  it("leaves focus in Go to line when the author opened it while the editor was loading", async () => {
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { controller, host, view } = await loadAt(1, undefined, true);
    controller.setup();
    try {
      openCustomGotoLinePanel(view);
      const line = host.querySelector<HTMLElement>(
        ".cm-gotoLine [contenteditable]",
      )!;
      line.focus();
      expect(document.activeElement).toBe(line);
      controller["handleIdle"]();
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(document.activeElement).toBe(line);
    } finally {
      hasFocus.mockRestore();
      clearInterval(controller["_focusIntervalTimeout"]);
      controller.dispose();
      host.remove();
    }
  });

  it("scrolls to where the screenplay preview scrolled while the editor was loading", async () => {
    const { controller } = await loadAt(1, at(1));
    controller["handleScrolledPreview"](
      ScrolledPreviewMessage.type.notification({
        type: "screenplay",
        textDocument: { uri: "file:///main.sd" },
        visibleRange: at(3),
        target: "element",
      }),
    );
    controller["handleIdle"]();
    expect(controller.scrolls).toEqual([at(3)]);
  });

  const retriesAfter = async (
    act: (controller: TestController) => void,
  ) => {
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const mounted = mount();
    const at1 = at(1);
    await mounted.controller["handleLoadEditor"]({
      ...LoadEditorMessage.type.request({
        textDocument: { uri: "file:///main.sd", languageId: "sparkdown", version: 0, text: "" },
        selectedRange: at1,
        visibleRange: "center",
        languageServerInitializeParams: {} as never,
        languageServerInitializeResult: {} as never,
      }),
      id: `load-${nextId++}`,
    } as LoadEditorMessage.Request);
    const { view } = created[created.length - 1]!;
    view.dispatch({
      changes: { from: view.state.doc.length, insert: "second\nthird\nfourth\n" },
    });
    const { controller } = mounted;
    try {
      controller["handleIdle"]();
      await vi.waitFor(() => expect(controller.settles).toBeGreaterThan(1), {
        timeout: 5_000,
        interval: 20,
      });
      act(controller);
      const settled = controller.settles;
      await new Promise((resolve) => setTimeout(resolve, 350));
      return controller.settles - settled;
    } finally {
      hasFocus.mockRestore();
      clearInterval(controller["_focusIntervalTimeout"]);
    }
  };

  it("stops the caret retry once the screenplay preview scrolls the settled editor", async () => {
    const retries = await retriesAfter((controller) =>
      controller["handleScrolledPreview"](
        ScrolledPreviewMessage.type.notification({
          type: "screenplay",
          textDocument: { uri: "file:///main.sd" },
          visibleRange: at(3),
          target: "element",
        }),
      ),
    );
    expect(retries).toBe(0);
  });

  it("stops the caret retry once collapsing the preview restores the editor's scroll", async () => {
    const retries = await retriesAfter((controller) => {
      controller["_visibleRange"] = at(3);
      controller["handleDidCollapsePreviewPane"]({} as never);
    });
    expect(retries).toBe(0);
  });

  it("keeps retrying the caret while nothing newer arrives", async () => {
    const retries = await retriesAfter(() => {});
    expect(retries).toBeGreaterThan(0);
  });

  it("still takes focus at the caret it loaded with when focus stayed put", async () => {
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { controller, host, view } = await loadAt(1, undefined, true);
    controller.setup();
    try {
      controller["handleIdle"]();
      await vi.waitFor(() => expect(view.hasFocus).toBe(true), {
        timeout: 5_000,
        interval: 20,
      });
    } finally {
      hasFocus.mockRestore();
      clearInterval(controller["_focusIntervalTimeout"]);
      controller.dispose();
      host.remove();
    }
  });

  it("still scrolls to the visible range it loaded with when nothing moved", async () => {
    const { controller } = await loadAt(1, at(2));
    controller["handleIdle"]();
    expect(controller.scrolls).toEqual([at(2)]);
  });

  it("stops putting the caret back once the author moves it after the editor settled", async () => {
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { controller, view } = await loadAt(1);
    try {
      controller["handleIdle"]();
      expect(controller["_focusIntervalTimeout"]).not.toBe(0);
      expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from);
      const clicked = view.state.doc.line(3).from;
      view.dispatch({ selection: { anchor: clicked }, userEvent: "select.pointer" });
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(view.state.selection.main.head).toBe(clicked);
    } finally {
      hasFocus.mockRestore();
      clearInterval(controller["_focusIntervalTimeout"]);
    }
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

  it("focuses the script at once when it is editable", async () => {
    const { controller, view } = await loadedEditor();
    const focus = vi.spyOn(view, "focus");
    expect(run(controller, "focus")).toMatchObject({ result: { ran: true } });
    expect(focus).toHaveBeenCalledOnce();
  });

  it("waits to focus a read-only script until it can be edited, for Edit's round trip", async () => {
    const { controller, view } = await loadedEditor();
    controller.setReadonly(true);
    const focus = vi.spyOn(view, "focus");
    expect(run(controller, "focus")).toMatchObject({ result: { ran: true } });
    expect(focus).not.toHaveBeenCalled();

    controller.setReadonly(false);
    expect(view.state.facet(EditorView.editable)).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("drops a waiting focus when the script returns to reading", async () => {
    const { controller, view } = await loadedEditor();
    controller.setReadonly(true);
    run(controller, "focus");
    controller.setScriptMode("reading");
    const focus = vi.spyOn(view, "focus");

    controller.setReadonly(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it("indents and dedents the caret's line for the writer's bar", async () => {
    const { controller, view } = await loadedEditor();
    expect(run(controller, "indent")).toMatchObject({ result: { ran: true } });
    expect(view.state.doc.line(1).text).toMatch(/^\s+hello world$/);
    expect(run(controller, "dedent")).toMatchObject({ result: { ran: true } });
    expect(view.state.doc.line(1).text).toBe("hello world");
  });

  it("opens Go to line inside the editor", async () => {
    const { controller, host } = await loadedEditor();
    controller.reveal();
    run(controller, "gotoLine");
    expect(host.querySelector(".cm-gotoLine")).not.toBeNull();
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

  const historyReports = (host: HTMLElement) => {
    const reported: [string, boolean, boolean][] = [];
    host.addEventListener(MessageProtocol.event, (e) => {
      const message = (e as CustomEvent).detail;
      if (ChangedEditorHistoryMessage.type.is(message)) {
        const { textDocument, canUndo, canRedo } = message.params;
        reported.push([textDocument.uri, canUndo, canRedo]);
      }
    });
    return reported;
  };

  it("reports the kept history under a renamed script's new name", async () => {
    const { controller, view, host } = await loadedEditor();
    const reported = historyReports(host);
    view.dispatch({ changes: { from: 0, insert: "> " }, userEvent: "input.type" });
    controller["handleLoadEditor"]({
      ...LoadEditorMessage.type.request({
        textDocument: { uri: "file:///opening.sd", languageId: "sparkdown", version: 1, text: "" },
        languageServerInitializeParams: {} as never,
        languageServerInitializeResult: {} as never,
        preserveEditor: true,
      }),
      id: `load-${nextId++}`,
    } as LoadEditorMessage.Request);
    expect(created[created.length - 1]!.view).toBe(view);
    expect(reported.at(-1)).toEqual(["file:///opening.sd", true, false]);
    view.dispatch({ changes: { from: 0, insert: "> " }, userEvent: "input.type" });
    expect(reported.at(-1)).toEqual(["file:///opening.sd", true, false]);
  });

  it("reports the first edit of the next script the same editor loads", async () => {
    const { controller, view, host } = await loadedEditor();
    const reported = historyReports(host);
    view.dispatch({ changes: { from: 0, insert: "> " }, userEvent: "input.type" });
    expect(reported).toEqual([["file:///main.sd", true, false]]);
    await load(controller, "file:///other.sd");
    const next = created[created.length - 1]!.view;
    expect(next).not.toBe(view);
    next.dispatch({ changes: { from: 0, insert: "> " }, userEvent: "input.type" });
    expect(reported.at(-1)).toEqual(["file:///other.sd", true, false]);
  });

  it("leaves a command for another document to that document's editor", async () => {
    const { controller, view, host } = await loadedEditor();
    expect(run(controller, "indent", "file:///other.sd")).toBeUndefined();
    expect(run(controller, "gotoLine", "file:///other.sd")).toBeUndefined();
    expect(view.state.doc.line(1).text).toBe("hello world");
    expect(host.querySelector(".cm-gotoLine")).toBeNull();
  });
});

describe("ScriptEditorController withheld diagnostic", () => {
  const withheldReports = (host: HTMLElement) => {
    const reported: ChangedEditorWithheldDiagnosticMessage.Notification["params"][] = [];
    host.addEventListener(MessageProtocol.event, (e) => {
      const message = (e as CustomEvent).detail;
      if (ChangedEditorWithheldDiagnosticMessage.type.is(message)) {
        reported.push(message.params);
      }
    });
    return reported;
  };

  const HELLO = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 5 },
  };

  it("tells the app the range it withholds, then releases it when the caret leaves", async () => {
    const { view, host } = await loadedEditor();
    view.dispatch({
      effects: StateEffect.appendConfig.of([
        versioning(4),
        serverDiagnostics().editorExtension!,
      ]),
    });
    const reported = withheldReports(host);
    view.dispatch({
      selection: { anchor: 0, head: 5 },
      effects: withholdDiagnostic.of({ from: 0, to: 5 }),
    });
    const version = getDocumentVersion(view.state);
    const textDocument = { uri: "file:///main.sd", version };
    expect(reported).toEqual([{ textDocument, range: HELLO }]);
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    expect(reported).toHaveLength(1);
    view.dispatch({ selection: { anchor: 8 } });
    expect(reported).toEqual([
      { textDocument, range: HELLO },
      { textDocument, range: null },
    ]);
  });

  it("releases with the edited version when the placeholder is typed over", async () => {
    const { view, host } = await loadedEditor();
    view.dispatch({
      effects: StateEffect.appendConfig.of([
        versioning(4),
        serverDiagnostics().editorExtension!,
      ]),
    });
    const reported = withheldReports(host);
    view.dispatch({
      selection: { anchor: 0, head: 5 },
      effects: withholdDiagnostic.of({ from: 0, to: 5 }),
    });
    const before = getDocumentVersion(view.state);
    view.dispatch({
      changes: { from: 0, to: 5, insert: "IMANI" },
      selection: { anchor: 5 },
      userEvent: "input.type",
    });
    expect(getDocumentVersion(view.state)).toBeGreaterThan(before);
    expect(reported.at(-1)).toEqual({
      textDocument: {
        uri: "file:///main.sd",
        version: getDocumentVersion(view.state),
      },
      range: null,
    });
  });
});
