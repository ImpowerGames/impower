import { EditorView } from "@codemirror/view";
import {
  showContextMenu,
  type ContextMenuEntry,
  type ContextMenuModel,
} from "@impower/codemirror-vscode-lsp-client/src";
import { ChangedEditorBreakpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorBreakpointsMessage";
import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { ToggleEditorBreakpointMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ToggleEditorBreakpointMessage";
import {
  MessageProtocol,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_OFF_APPEARANCE } from "./fixtures/scriptAppearance";

const action = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock("../src/cm-breakpoints/breakpoints", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/cm-breakpoints/breakpoints")>();
  return {
    ...actual,
    toggleBreakpointAtCaret: (view: EditorView) => {
      action.calls.push(view);
      return actual.toggleBreakpointAtCaret(view);
    },
  };
});

const { ScriptEditorController } = await import(
  "../src/modules/script-editor/ScriptEditorController"
);

Range.prototype.getClientRects ??= () =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const URI = "file:///main.sd";

const SCRIPT = [
  "scene start",
  "  HERO:",
  "    The first line.",
  "",
  "    The second line.",
  "end",
].join("\n");

const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  action.calls.splice(0);
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const mount = async (coarsePointer: boolean) => {
  const host = document.body.appendChild(document.createElement("div"));
  let menu: ContextMenuModel | null = null;
  const reported: number[][] = [];
  const worker = Object.assign(new EventTarget(), {
    postMessage: () => {},
  }) as unknown as Worker;
  const controller = new ScriptEditorController(
    host,
    {
      editor: host.appendChild(document.createElement("div")),
      loading: host.appendChild(document.createElement("div")),
      main: host.appendChild(document.createElement("div")),
      placeholder: host.appendChild(document.createElement("div")),
    },
    {
      coarsePointer,
      appearance: ALL_OFF_APPEARANCE,
      onContextMenu: (model) => {
        menu = model;
      },
      languageServerWorker: worker,
      languageServerConnection: {
        onRequest: () => ({ dispose: () => {} }),
      } as never,
    },
  );
  const hear = (e: Event) => {
    const message = (e as CustomEvent).detail;
    if (ChangedEditorBreakpointsMessage.type.is(message)) {
      reported.push(message.params.breakpointLines);
    }
  };
  window.addEventListener(MessageProtocol.event, hear);
  controller.setup();
  await controller["handleLoadEditor"]({
    ...LoadEditorMessage.type.request({
      textDocument: { uri: URI, languageId: "sparkdown", version: 0, text: SCRIPT },
      languageServerInitializeParams: {} as never,
      languageServerInitializeResult: { capabilities: {} } as never,
    }),
    id: "caret-load",
  });
  const view = controller["_view"] as EditorView;
  cleanups.push(() => {
    window.removeEventListener(MessageProtocol.event, hear);
    controller.dispose();
    host.remove();
  });
  const caretOn = (lineNumber: number) =>
    view.dispatch({ selection: { anchor: view.state.doc.line(lineNumber).from + 4 } });
  const openMenu = () => {
    menu = null;
    const { from, to } = view.state.selection.main;
    showContextMenu(view, { pos: from, end: to });
    return menu as ContextMenuModel | null;
  };
  return { view, reported, caretOn, openMenu };
};

const entry = (menu: ContextMenuModel | null, label: string) =>
  menu?.items.find(
    (item): item is ContextMenuEntry => "label" in item && item.label === label,
  );

const labels = (menu: ContextMenuModel | null) =>
  (menu?.items ?? []).map((item) => ("label" in item ? item.label : "|"));

const markers = (view: EditorView) =>
  Array.from(view.dom.querySelectorAll(".cm-breakpoint-gutter .cm-breakpoint"));

const toggleOverProtocol = (uri: string) =>
  new Promise<ToggleEditorBreakpointMessage.Response | null>((resolve) => {
    const request = ToggleEditorBreakpointMessage.type.request({
      textDocument: { uri },
    });
    const timer = setTimeout(() => {
      window.removeEventListener(MessageProtocol.event, listen);
      resolve(null);
    }, 200);
    const listen = (e: Event) => {
      const message = (e as CustomEvent).detail;
      if (ToggleEditorBreakpointMessage.type.isResponse(message, request.id)) {
        clearTimeout(timer);
        window.removeEventListener(MessageProtocol.event, listen);
        resolve(message);
      }
    };
    window.addEventListener(MessageProtocol.event, listen);
    sendProtocolMessage(request);
  });

describe("the caret line's breakpoint action on a phone", () => {
  it("adds and removes the caret line's breakpoint from the touch selection menu with line numbers off", async () => {
    const { view, reported, caretOn, openMenu } = await mount(true);
    expect(view.dom.classList.contains("cm-line-numbers")).toBe(false);
    caretOn(3);
    const first = openMenu();
    expect(entry(first, "Remove breakpoint")).toBeUndefined();
    entry(first, "Add breakpoint")!.run();
    expect(action.calls).toEqual([view]);
    expect(reported).toEqual([[2]]);
    expect(markers(view)).toHaveLength(1);
    expect(view.dom.classList.contains("cm-has-breakpoints")).toBe(true);

    const second = openMenu();
    expect(entry(second, "Add breakpoint")).toBeUndefined();
    entry(second, "Remove breakpoint")!.run();
    expect(action.calls).toEqual([view, view]);
    expect(reported).toEqual([[2], []]);
    expect(markers(view)).toHaveLength(0);
  });

  it("toggles the caret's line, not the first selected line, and keeps the selection, for a selection made forward", async () => {
    const { view, reported, openMenu } = await mount(true);
    const anchor = view.state.doc.line(3).from + 4;
    const head = view.state.doc.line(5).from + 8;
    view.dispatch({ selection: { anchor, head } });
    const first = openMenu();
    entry(first, "Add breakpoint")!.run();
    expect(reported).toEqual([[4]]);
    expect(view.state.selection.main).toMatchObject({ anchor, head });

    const second = openMenu();
    expect(entry(second, "Add breakpoint")).toBeUndefined();
    entry(second, "Remove breakpoint")!.run();
    expect(reported).toEqual([[4], []]);
    expect(action.calls).toEqual([view, view]);
  });

  it("offers the item after the menu's other items, behind a separator", async () => {
    const { caretOn, openMenu } = await mount(true);
    caretOn(3);
    expect(labels(openMenu()).slice(-2)).toEqual(["|", "Add breakpoint"]);
  });

  it("toggles the caret line's breakpoint when the workspace asks over the editor protocol", async () => {
    const { view, reported, caretOn } = await mount(true);
    caretOn(5);
    const response = await toggleOverProtocol(URI);
    expect(response?.result).toEqual({ line: 4 });
    expect(action.calls).toEqual([view]);
    expect(reported).toEqual([[4]]);
    await toggleOverProtocol(URI);
    expect(reported).toEqual([[4], []]);
  });

  it("leaves another document's request to that document's editor", async () => {
    const { reported } = await mount(true);
    expect(await toggleOverProtocol("file:///other.sd")).toBeNull();
    expect(action.calls).toEqual([]);
    expect(reported).toEqual([]);
  });

  it("offers no breakpoint item in a fine pointer's context menu", async () => {
    const { view, caretOn } = await mount(false);
    caretOn(3);
    showContextMenu(view, { pos: view.state.selection.main.head });
    const shown = Array.from(
      document.querySelectorAll(".cm-context-menu .cm-menu-item"),
    ).map((item) => item.textContent);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.some((label) => label?.includes("breakpoint"))).toBe(false);
  });
});
