import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  coarsePointer,
  contextMenu,
  isContextMenuOpen,
  presentContextMenu,
  showContextMenu,
  type ContextMenuModel,
} from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let view: EditorView | undefined;

beforeEach(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

const DOC = "scene intro\n\n  -> intro";

function mount(selection: EditorSelection, extensions: Extension[] = []) {
  view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      selection,
      extensions: [contextMenu(), ...extensions],
    }),
    parent: document.body.appendChild(document.createElement("div")),
  });
  return view;
}

const rows = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".cm-context-menu > *"),
  ).map((el) =>
    el.classList.contains("cm-menu-separator")
      ? "---"
      : (el.firstElementChild?.textContent ?? ""),
  );

const item = (label: string) =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".cm-context-menu .cm-menu-item"),
  ).find((el) => el.firstElementChild?.textContent === label)!;

const openAt = (v: EditorView, pos: number) =>
  showContextMenu(v, { pos, x: 10, y: 10 });

describe("the context menu on a fine pointer", () => {
  it("offers the text commands, then the name's commands where the pointer is on a name", () => {
    const v = mount(EditorSelection.single(8));
    openAt(v, 8);
    expect(rows()).toEqual([
      "Cut",
      "Copy",
      "Paste",
      "Select all",
      "---",
      "Rename",
      "Find references",
      "Go to definition",
    ]);
  });

  it("offers only the text commands, with no trailing rule, where the pointer is not on a name", () => {
    const v = mount(EditorSelection.single(12));
    openAt(v, 12);
    expect(rows()).toEqual(["Cut", "Copy", "Paste", "Select all"]);
  });

  it("disables Cut and Copy with nothing selected and enables them over a selection", () => {
    const v = mount(EditorSelection.single(8));
    openAt(v, 8);
    expect(item("Cut").getAttribute("aria-disabled")).toBe("true");
    expect(item("Copy").classList.contains("cm-menu-disabled")).toBe(true);
    v.dispatch({ selection: EditorSelection.range(6, 11) });
    openAt(v, 6);
    expect(item("Cut").getAttribute("aria-disabled")).toBe("false");
  });

  it("shows each command's shortcut", () => {
    const v = mount(EditorSelection.single(8));
    openAt(v, 8);
    expect(item("Copy").querySelector(".cm-menu-shortcut")?.textContent).toMatch(
      /^(Ctrl|Cmd)\+C$/,
    );
    expect(item("Rename").querySelector(".cm-menu-shortcut")?.textContent).toBe(
      "F2",
    );
  });

  it("runs Select all and closes", () => {
    const v = mount(EditorSelection.single(8));
    openAt(v, 8);
    item("Select all").click();
    expect(v.state.selection.main.from).toBe(0);
    expect(v.state.selection.main.to).toBe(DOC.length);
    expect(isContextMenuOpen(v)).toBe(false);
  });

  it("closes on Escape", () => {
    const v = mount(EditorSelection.single(8));
    openAt(v, 8);
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    v.contentDOM.dispatchEvent(escape);
    expect(isContextMenuOpen(v)).toBe(false);
    expect(escape.defaultPrevented).toBe(true);
  });

  it("closes on a wheel scroll outside it, and stays open for one inside it", () => {
    const v = mount(EditorSelection.single(8));
    openAt(v, 8);
    item("Copy").dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    expect(isContextMenuOpen(v)).toBe(true);
    v.scrollDOM.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    expect(isContextMenuOpen(v)).toBe(false);
  });

  it("closes when the editor scrolls by any means, and stays open when the menu itself scrolls", () => {
    const v = mount(EditorSelection.single(8));
    openAt(v, 8);
    document
      .querySelector(".cm-context-menu")!
      .dispatchEvent(new Event("scroll"));
    expect(isContextMenuOpen(v)).toBe(true);
    v.scrollDOM.dispatchEvent(new Event("scroll"));
    expect(isContextMenuOpen(v)).toBe(false);
  });

  it("closes when the window loses focus", () => {
    const v = mount(EditorSelection.single(8));
    openAt(v, 8);
    window.dispatchEvent(new FocusEvent("blur"));
    expect(isContextMenuOpen(v)).toBe(false);
  });

  it("moves the caret to a right-click outside the selection, and keeps a selection the right-click is inside", () => {
    const v = mount(EditorSelection.single(0));
    const rightClick = (pos: number) => {
      v.posAtCoords = (() => pos) as EditorView["posAtCoords"];
      v.contentDOM.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    };
    rightClick(8);
    expect(v.state.selection.main.head).toBe(8);
    expect(v.state.selection.main.empty).toBe(true);
    v.dispatch({ selection: EditorSelection.single(6, 11) });
    rightClick(8);
    expect(v.state.selection.main.from).toBe(6);
    expect(v.state.selection.main.to).toBe(11);
  });

  it("opens on right-click at the pointer", () => {
    const v = mount(EditorSelection.single(8));
    v.posAtCoords = (() => 8) as EditorView["posAtCoords"];
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 12,
    });
    v.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(isContextMenuOpen(v)).toBe(true);
    expect(document.querySelector(".cm-context-menu")?.getAttribute("role")).toBe(
      "menu",
    );
  });
});

describe("the context menu on a coarse pointer", () => {
  it("goes to the host's presenter instead of drawing a menu in the editor", () => {
    let presented: ContextMenuModel | null = null;
    const v = mount(EditorSelection.single(6, 11), [
      coarsePointer.of(true),
      presentContextMenu((menu) => (presented = menu)),
    ]);
    showContextMenu(v, { pos: 6, end: 11 });
    expect(document.querySelector(".cm-context-menu")).toBeNull();
    const labels = presented!.items.map((entry) =>
      "type" in entry ? "---" : entry.label,
    );
    expect(labels).toEqual([
      "Cut",
      "Copy",
      "Paste",
      "Select all",
      "---",
      "Rename",
      "Find references",
      "Go to definition",
    ]);
  });

  it("draws the menu in the editor when no host presents it", () => {
    const v = mount(EditorSelection.single(6, 11), [coarsePointer.of(true)]);
    showContextMenu(v, { pos: 6, end: 11 });
    expect(document.querySelector(".cm-context-menu")).not.toBeNull();
    expect(item("Copy").querySelector(".cm-menu-shortcut")).toBeNull();
  });
});
