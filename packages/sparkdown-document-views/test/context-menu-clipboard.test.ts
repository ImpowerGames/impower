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
let clipboardText: string;

beforeEach(async () => {
  vi.resetModules();
  ({ EditorSelection, EditorState } = await import("@codemirror/state"));
  ({ EditorView } = await import("@codemirror/view"));
  lsp = await import("@impower/codemirror-vscode-lsp-client/src");
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  clipboardText = "system clipboard text";
  writeText = vi.fn(async (text: string) => {
    clipboardText = text;
  });
  readText = vi.fn(async () => clipboardText);
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

async function pick(v: EditorViewType, label: string) {
  openMenu(v);
  menuItem(label).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function withoutClipboardRead() {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

function select(v: EditorViewType, ...ranges: [number, number][]) {
  v.dispatch({
    selection: EditorSelection.create(
      ranges.map(([from, to]) => EditorSelection.range(from, to)),
    ),
  });
}

describe("menu Copy and Paste", () => {
  it("Copy then Paste inserts the copied text, read back from the system clipboard", async () => {
    const v = mount("hello world");
    select(v, [0, 5]);
    await pick(v, "Copy");
    expect(writeText).toHaveBeenCalledWith("hello");
    select(v, [11, 11]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("hello worldhello");
    expect(readText).toHaveBeenCalled();
  });

  it("Paste inserts text copied outside the editor from the system clipboard", async () => {
    const v = mount("hello world");
    select(v, [0, 5]);
    await pick(v, "Copy");
    clipboardText = "from elsewhere";
    select(v, [11, 11]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("hello worldfrom elsewhere");
  });

  it("Paste gives each line of system text to its own cursor when the counts match, as keyboard paste does", async () => {
    clipboardText = "A\nB";
    const v = mount("1\n2");
    select(v, [1, 1], [3, 3]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("1A\n2B");
  });

  it("a refused read goes to the host and still pastes the editor's own copy", async () => {
    const refused = vi.fn();
    const v = mount("hello world", undefined, [lsp.onPasteRefused(refused)]);
    select(v, [0, 5]);
    await pick(v, "Copy");
    readText.mockImplementation(async () => {
      throw new DOMException("Denied", "NotAllowedError");
    });
    select(v, [11, 11]);
    await pick(v, "Paste");
    expect(refused).toHaveBeenCalledWith(v);
    expect(v.state.doc.toString()).toBe("hello worldhello");
  });

  it("a refused read with nothing copied in the editor goes to the host and inserts nothing", async () => {
    const refused = vi.fn();
    const v = mount("hello world", undefined, [lsp.onPasteRefused(refused)]);
    readText.mockImplementation(async () => {
      throw new DOMException("Denied", "NotAllowedError");
    });
    select(v, [11, 11]);
    await pick(v, "Paste");
    expect(refused).toHaveBeenCalledTimes(1);
    expect(v.state.doc.toString()).toBe("hello world");
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
    readText.mockImplementation(async () => {
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
  function fire(v: EditorViewType, type: "copy" | "cut", copied: string) {
    v.focus();
    v.contentDOM.dispatchEvent(
      new Event(type, { bubbles: true, cancelable: true }),
    );
    clipboardText = copied;
  }

  it("a native copy fills the buffer that menu Paste reads", async () => {
    const v = mount("hello world");
    select(v, [6, 11]);
    fire(v, "copy", "world");
    select(v, [0, 0]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("worldhello world");
  });

  it("a native copy carrying clipboardData fills the buffer and still reaches the system clipboard", async () => {
    const v = mount("hello world");
    select(v, [6, 11]);
    v.focus();
    const setData = vi.fn((_type: string, text: string) => {
      clipboardText = text;
    });
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

  it("enables Paste in a menu that is already open, where the system clipboard cannot be read", async () => {
    withoutClipboardRead();
    const v = mount("one\ntwo");
    select(v, [1, 1]);
    openMenu(v);
    expect(menuItem("Paste").classList.contains("cm-menu-disabled")).toBe(true);
    fire(v, "copy", "one\n");
    expect(lsp.isContextMenuOpen(v)).toBe(true);
    expect(menuItem("Paste").classList.contains("cm-menu-disabled")).toBe(
      false,
    );
    menuItem("Paste").click();
    expect(v.state.doc.toString()).toBe("one\none\ntwo");
  });

  it("a copy event from outside the focused editor leaves the buffer alone", async () => {
    withoutClipboardRead();
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
    fire(v, "cut", " world");
    expect(v.state.doc.toString()).toBe("hello");
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("hello world");
  });

  it("a native copy of a bare caret pastes its whole line above the cursor's line, as the keyboard does", async () => {
    const v = mount("one\ntwo");
    select(v, [1, 1]);
    fire(v, "copy", "one\n");
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
    const setData = vi.fn((_type: string, text: string) => {
      clipboardText = text;
    });
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

  it("gives each line of an output-filtered copy to its own cursor when the counts match, as keyboard paste does", async () => {
    const v = mount("ab cd\n1\n2", undefined, [
      EditorView.clipboardOutputFilter.of((text) => text.toUpperCase()),
    ]);
    select(v, [0, 2], [3, 5]);
    await pick(v, "Copy");
    expect(writeText).toHaveBeenCalledWith("AB\nCD");
    select(v, [7, 7], [9, 9]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("ab cd\n1AB\n2CD");
  });

  it("pastes a line-wise copy as plain text once an input filter changes it, as keyboard paste does", async () => {
    const v = mount("one\ntwo", undefined, [
      EditorView.clipboardInputFilter.of((text) => text.toUpperCase()),
    ]);
    select(v, [1, 1]);
    v.focus();
    v.contentDOM.dispatchEvent(
      new Event("copy", { bubbles: true, cancelable: true }),
    );
    clipboardText = "one\n";
    select(v, [4, 4]);
    await pick(v, "Paste");
    expect(v.state.doc.toString()).toBe("one\nONEtwo");
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
  it("is enabled where the system clipboard can be read, before anything is copied", async () => {
    const v = mount("hello world");
    select(v, [11, 11]);
    openMenu(v);
    expect(menuItem("Paste").classList.contains("cm-menu-disabled")).toBe(false);
  });

  it("is disabled until something is copied where the system clipboard cannot be read, and clicking it then does nothing", async () => {
    withoutClipboardRead();
    const v = mount("hello world");
    select(v, [11, 11]);
    openMenu(v);
    expect(menuItem("Paste").classList.contains("cm-menu-disabled")).toBe(true);
    menuItem("Paste").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(v.state.doc.toString()).toBe("hello world");
    expect(lsp.isContextMenuOpen(v)).toBe(true);

    select(v, [0, 5]);
    await pick(v, "Copy");
    select(v, [11, 11]);
    openMenu(v);
    expect(menuItem("Paste").classList.contains("cm-menu-disabled")).toBe(
      false,
    );
  });

  it("is greyed out in the menu a coarse pointer opens until something is copied, where the system clipboard cannot be read", async () => {
    withoutClipboardRead();
    const v = mount("hello world", EditorSelection.single(11), [
      lsp.coarsePointer.of(true),
    ]);
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
