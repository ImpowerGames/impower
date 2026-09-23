// The editor context menu's Cut, Copy and Paste (#805) share an in-memory
// buffer, so menu Paste never reads the system clipboard and never makes the
// browser ask for clipboard access. Menu Copy and Cut still write the system
// clipboard, and the editor's native copy and cut events fill the buffer too.
//
// The buffer lives at module level for the whole page, so every test imports a
// fresh copy of the editor modules.
import type {
  EditorSelection as EditorSelectionType,
  EditorState as EditorStateType,
  Extension,
} from "@codemirror/state";
import type { EditorView as EditorViewType } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let EditorSelection: typeof EditorSelectionType;
let EditorState: typeof EditorStateType;
let EditorView: typeof EditorViewType;
let lsp: typeof import("@impower/codemirror-vscode-lsp-client/src");

let view: EditorViewType | undefined;
let writeText: ReturnType<typeof vi.fn>;
let readText: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  ({ EditorSelection, EditorState } = await import("@codemirror/state"));
  ({ EditorView } = await import("@codemirror/view"));
  lsp = await import("@impower/codemirror-vscode-lsp-client/src");
  // jsdom has no layout; CodeMirror measures text through these.
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  writeText = vi.fn(async () => {});
  readText = vi.fn(async () => "system clipboard text");
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText, readText },
    configurable: true,
  });
});

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  delete (navigator as { clipboard?: unknown }).clipboard;
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
});

function editor(
  doc: string,
  selection?: EditorSelectionType,
  extensions: Extension[] = [],
) {
  return new EditorView({
    doc,
    selection,
    parent: document.body.appendChild(document.createElement("div")),
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      lsp.contextMenu(),
      extensions,
    ],
  });
}

function mount(
  doc: string,
  selection?: EditorSelectionType,
  extensions: Extension[] = [],
) {
  view = editor(doc, selection, extensions);
  return view;
}

function openMenu(v: EditorViewType) {
  lsp.hideContextMenu(v);
  lsp.showContextMenu(v, { pos: v.state.selection.main.head, x: 10, y: 10 });
}

function menuItem(label: string) {
  const item = [
    ...document.querySelectorAll<HTMLElement>(".cm-context-menu .cm-menu-item"),
  ].find((el) => el.firstElementChild?.textContent === label);
  if (!item) {
    throw new Error(`No "${label}" item in the open menu`);
  }
  return item;
}

/** Opens the menu for the current selection and picks an item from it. */
async function pick(v: EditorViewType, label: string) {
  openMenu(v);
  menuItem(label).click();
  // Let the system-clipboard write settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function select(v: EditorViewType, ...ranges: [number, number][]) {
  v.dispatch({
    selection: EditorSelection.create(
      ranges.map(([from, to]) => EditorSelection.range(from, to)),
    ),
  });
}

describe("menu Copy and Paste", () => {
  it("Copy then Paste inserts the copied text without reading the system clipboard", async () => {
    const v = mount("hello world");
    select(v, [0, 5]);
    await pick(v, "Copy");
    expect(writeText).toHaveBeenCalledWith("hello");
    select(v, [11, 11]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("hello worldhello");
    expect(readText).not.toHaveBeenCalled();
  });

  it("Cut removes the selection and Paste puts it back", async () => {
    const v = mount("hello world");
    select(v, [5, 11]);
    await pick(v, "Cut");
    expect(v.state.doc.toString()).toBe("hello");
    expect(writeText).toHaveBeenCalledWith(" world");
    select(v, [5, 5]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("hello world");
    expect(readText).not.toHaveBeenCalled();
  });

  it("pastes each copied piece to its own cursor when the counts match", async () => {
    const v = mount("ab cd\n1\n2");
    select(v, [0, 2], [3, 5]);
    await pick(v, "Copy");
    select(v, [7, 7], [9, 9]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("ab cd\n1ab\n2cd");
  });

  it("pastes the pieces joined by newlines at every cursor when the counts differ", async () => {
    const v = mount("ab cd\n1\n2\n3");
    select(v, [0, 2], [3, 5]);
    await pick(v, "Copy");
    select(v, [7, 7], [9, 9], [11, 11]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("ab cd\n1ab\ncd\n2ab\ncd\n3ab\ncd");
  });

  it("Copy still fills the buffer when the system clipboard refuses the write", async () => {
    writeText.mockImplementation(async () => {
      throw new DOMException("Denied", "NotAllowedError");
    });
    const v = mount("hello world");
    select(v, [0, 5]);
    await pick(v, "Copy");
    select(v, [11, 11]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("hello worldhello");
  });

  it("Cut still removes the selection when the system clipboard refuses the write", async () => {
    writeText.mockImplementation(async () => {
      throw new DOMException("Denied", "NotAllowedError");
    });
    const v = mount("hello world");
    select(v, [5, 11]);
    await pick(v, "Cut");
    expect(v.state.doc.toString()).toBe("hello");
  });

  it("the buffer is shared by every editor on the page", async () => {
    const first = mount("hello");
    const second = editor("world");
    try {
      select(first, [0, 5]);
      await pick(first, "Copy");
      select(second, [5, 5]);
      await pick(second, "Paste");
      expect(second.state.doc.toString()).toBe("worldhello");
    } finally {
      second.destroy();
    }
  });
});

describe("native copy and cut", () => {
  function fire(v: EditorViewType, type: "copy" | "cut") {
    // A keyboard copy happens in a focused editor. jsdom's events carry no
    // clipboardData, so CodeMirror takes its fallback path; either way the
    // selection is what it copies.
    v.focus();
    v.contentDOM.dispatchEvent(
      new Event(type, { bubbles: true, cancelable: true }),
    );
  }

  it("a native copy fills the buffer that menu Paste reads", async () => {
    const v = mount("hello world");
    select(v, [6, 11]);
    fire(v, "copy");
    select(v, [0, 0]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("worldhello world");
    expect(readText).not.toHaveBeenCalled();
  });

  it("a native copy carrying clipboardData fills the buffer and still reaches the system clipboard", async () => {
    // A real browser's copy event carries clipboardData, and CodeMirror then
    // writes the text there itself and ends the event.
    const v = mount("hello world");
    select(v, [6, 11]);
    v.focus();
    const setData = vi.fn();
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { clearData() {}, setData },
    });
    v.contentDOM.dispatchEvent(event);
    expect(setData).toHaveBeenCalledWith("text/plain", "world");
    select(v, [0, 0]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("worldhello world");
  });

  it("enables Paste in a menu that is already open", async () => {
    const v = mount("one\ntwo");
    select(v, [1, 1]);
    openMenu(v);
    expect(menuItem("Paste").classList.contains("cm-menu-disabled")).toBe(true);
    fire(v, "copy");
    expect(lsp.isContextMenuOpen(v)).toBe(true);
    expect(menuItem("Paste").classList.contains("cm-menu-disabled")).toBe(
      false,
    );
    menuItem("Paste").click();
    expect(v.state.doc.toString()).toBe("one\none\ntwo");
  });

  it("a copy event from outside the focused editor leaves the buffer alone", async () => {
    const v = mount("hello world");
    select(v, [6, 11]);
    v.contentDOM.dispatchEvent(
      new Event("copy", { bubbles: true, cancelable: true }),
    );
    openMenu(v);
    expect(menuItem("Paste").classList.contains("cm-menu-disabled")).toBe(true);
  });

  it("a native cut fills the buffer and still deletes the selection", async () => {
    const v = mount("hello world");
    select(v, [5, 11]);
    fire(v, "cut");
    expect(v.state.doc.toString()).toBe("hello");
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("hello world");
  });

  it("a native copy of a bare caret pastes its whole line above the cursor's line, as the keyboard does", async () => {
    const v = mount("one\ntwo");
    select(v, [1, 1]);
    fire(v, "copy");
    select(v, [5, 5]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("one\none\ntwo");
  });
});

describe("clipboard filters", () => {
  const prefix = (text: string) => `FILTERED:${text}`;

  it("a native copy records the text the editor's output filters put on the clipboard", async () => {
    const v = mount("hello world", undefined, [
      EditorView.clipboardOutputFilter.of(prefix),
    ]);
    select(v, [0, 5]);
    v.focus();
    const setData = vi.fn();
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { clearData() {}, setData },
    });
    v.contentDOM.dispatchEvent(event);
    expect(setData).toHaveBeenCalledWith("text/plain", "FILTERED:hello");
    select(v, [11, 11]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("hello worldFILTERED:hello");
  });

  it("menu Copy puts the output-filtered text on the system clipboard and in the buffer", async () => {
    const v = mount("hello world", undefined, [
      EditorView.clipboardOutputFilter.of(prefix),
    ]);
    select(v, [0, 5]);
    await pick(v, "Copy");
    expect(writeText).toHaveBeenCalledWith("FILTERED:hello");
    select(v, [11, 11]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("hello worldFILTERED:hello");
  });

  it("menu Paste passes the text through the editor's input filters", async () => {
    const v = mount("hello world", undefined, [
      EditorView.clipboardInputFilter.of((text) => text.toUpperCase()),
    ]);
    select(v, [0, 5]);
    await pick(v, "Copy");
    select(v, [11, 11]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("hello worldHELLO");
  });
});

describe("the Paste item", () => {
  it("is disabled until something is copied, and clicking it then does nothing", async () => {
    const v = mount("hello world");
    select(v, [11, 11]);
    openMenu(v);
    expect(menuItem("Paste").classList.contains("cm-menu-disabled")).toBe(true);
    menuItem("Paste").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(v.state.doc.toString()).toBe("hello world");
    expect(readText).not.toHaveBeenCalled();
    // A click on a disabled item leaves the menu open, as a native menu does.
    expect(lsp.isContextMenuOpen(v)).toBe(true);

    select(v, [0, 5]);
    await pick(v, "Copy");
    select(v, [11, 11]);
    openMenu(v);
    expect(menuItem("Paste").classList.contains("cm-menu-disabled")).toBe(
      false,
    );
  });

  it("is greyed out on the touch toolbar until something is copied", async () => {
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: 5,
      configurable: true,
    });
    const v = mount("hello world", EditorSelection.single(11));
    lsp.showContextMenu(v, { pos: 11, end: 11 });
    expect(menuItem("Paste").classList.contains("cm-menu-disabled")).toBe(true);
    select(v, [0, 5]);
    lsp.hideContextMenu(v);
    lsp.showContextMenu(v, { pos: 0, end: 5 });
    menuItem("Copy").click();
    lsp.hideContextMenu(v);
    lsp.showContextMenu(v, { pos: 5, end: 5 });
    expect(menuItem("Paste").classList.contains("cm-menu-disabled")).toBe(
      false,
    );
  });
});
