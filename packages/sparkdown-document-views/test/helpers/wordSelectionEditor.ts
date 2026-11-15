import { EditorView } from "@codemirror/view";
import { shortcutPlatform, type LSPClient } from "@impower/codemirror-vscode-lsp-client/src";
import { vi } from "vitest";
import { SparkdownCodemirrorWorkspace } from "../../src/modules/script-editor/classes/SparkdownCodemirrorWorkspace";
import createEditorView from "../../src/modules/script-editor/utils/createEditorView";
import { ALL_ON_APPEARANCE } from "../fixtures/scriptAppearance";

export type Point = [line: number, ch: number];

export const PX = 20;

const views: EditorView[] = [];

export const installRangeRects = () => {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      Object.assign([], { item: () => null }) as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
};

const withPointer = (view: EditorView) => {
  const posAt = ({ x }: { x: number }) => Math.round(x / PX);
  vi.spyOn(view, "posAtCoords").mockImplementation(posAt as never);
  vi.spyOn(view, "posAndSideAtCoords").mockImplementation(((coords: { x: number }) => ({
    pos: posAt(coords),
    assoc: coords.x < posAt(coords) * PX ? -1 : 1,
  })) as never);
  views.push(view);
  return view;
};

export const liveEditor = (lines: string[]) => {
  const parent = document.body.appendChild(document.createElement("div"));
  const worker = Object.assign(new EventTarget(), {
    postMessage: () => {},
  }) as unknown as Worker;
  const [view] = createEditorView(parent, {
    appearance: ALL_ON_APPEARANCE,
    serverWorker: worker,
    serverConnection: { onRequest: () => ({ dispose: () => {} }) } as never,
    serverInitializeParams: {} as never,
    serverInitializeResult: { capabilities: {} } as never,
    serverWorkspace: (client: LSPClient) =>
      new SparkdownCodemirrorWorkspace(client, {
        showDocument: async () => {},
        applyWorkspaceEdit: async () => ({ applied: false }),
      } as never),
    textDocument: { uri: "file:///main.sd", version: 0, text: lines.join("\n") },
    top: 0,
    bottom: 0,
  } as never) as unknown as [EditorView];
  return withPointer(view);
};

export const plainEditor = (lines: string[]) =>
  withPointer(new EditorView({ doc: lines.join("\n"), parent: document.body.appendChild(document.createElement("div")) }));

export const destroyEditors = () => {
  views.splice(0).forEach((view) => view.destroy());
  vi.restoreAllMocks();
  document.body.innerHTML = "";
};

export const offset = (lines: string[], [line, ch]: Point) =>
  lines.slice(0, line).reduce((sum, text) => sum + text.length + 1, 0) + ch;

export const leftQuarterOf = (ch: number) => ch * PX + PX / 4;
export const rightQuarterOf = (ch: number) => (ch + 1) * PX - PX / 4;

const commandKey = (): KeyboardEventInit => (shortcutPlatform() === "mac" ? { metaKey: true } : { ctrlKey: true });

const mouse = (view: EditorView, type: string, x: number, detail: number, modifiers: MouseEventInit) => {
  const init = { bubbles: true, cancelable: true, button: 0, buttons: type === "mouseup" ? 0 : 1, detail, clientX: x, clientY: 1, ...modifiers };
  (type === "mousedown" ? view.contentDOM : view.contentDOM.ownerDocument).dispatchEvent(new MouseEvent(type, init));
};

export const doubleClick = (
  view: EditorView,
  x: number,
  dragTo?: number,
  { caret = 0, shiftKey = false, addsRange = false }: { caret?: number; shiftKey?: boolean; addsRange?: boolean } = {},
) => {
  const modifiers = { shiftKey, ...(addsRange ? commandKey() : {}) };
  view.dispatch({ selection: { anchor: caret } });
  mouse(view, "mousedown", x, 1, modifiers);
  mouse(view, "mouseup", x, 1, modifiers);
  mouse(view, "mousedown", x, 2, modifiers);
  if (dragTo !== undefined) mouse(view, "mousemove", dragTo, 2, modifiers);
  mouse(view, "mouseup", dragTo ?? x, 2, modifiers);
  return view.state.selection;
};

export const pressKey = (view: EditorView, key: string, modifiers: KeyboardEventInit = {}) =>
  view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...modifiers }));

export const pressSelectNext = (view: EditorView) => pressKey(view, "d", commandKey());
