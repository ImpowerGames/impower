import {
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { customSearchPanel } from "../src/modules/script-editor/utils/extensions/customSearch";

/**
 * jsdom implements `Range` but none of its geometry, and CodeMirror measures
 * text by asking a `Range` for its client rects on an animation frame. An empty
 * list is what a layout engine that does no layout honestly reports, and
 * CodeMirror already falls back to a default character width when it sees one.
 */
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

/** The hard space a contenteditable mints in place of one that would collapse. */
const NBSP = String.fromCharCode(0xa0);

const DOC = ["hello world", "hello there", "one", "two", ""].join("\n");

let view: EditorView | undefined;

const mount = (doc = DOC) => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [customSearchPanel()] }),
    parent,
  });
  openSearchPanel(view);
  return view;
};

const panelOf = (view: EditorView) =>
  view.dom.querySelector(".cm-panel.cm-search");

const fields = (view: EditorView) => {
  const panel = panelOf(view);
  expect(panel).toBeTruthy();
  const search = panel!.querySelector<HTMLElement>('div[name="search"]');
  const replace = panel!.querySelector<HTMLElement>('div[name="replace"]');
  expect(search).toBeTruthy();
  expect(replace).toBeTruthy();
  return { search: search!, replace: replace! };
};

const control = <T extends HTMLElement>(view: EditorView, name: string) => {
  const el = panelOf(view)!.querySelector<T>(`button[name="${name}"]`);
  expect(el).toBeTruthy();
  return el!;
};

/** Announce a field edit the way a browser announces the user's own. */
const input = (field: HTMLElement) => {
  field.dispatchEvent(new InputEvent("input", { bubbles: true }));
  field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
};

const type = (field: HTMLElement, text: string) => {
  field.textContent = text;
  input(field);
};

/**
 * Put the caret in a field.
 *
 * `at` counts characters into the field's first text node, which is where the
 * caret sits after typing into a field the panel has written.
 */
const caret = (field: HTMLElement, at: number) => {
  const range = document.createRange();
  const node = field.firstChild;
  if (node && node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, at);
  } else {
    range.selectNodeContents(field);
    range.collapse(true);
  }
  range.collapse(true);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
};

const press = (field: HTMLElement, key: string, init: KeyboardEventInit = {}) =>
  field.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
  );

/**
 * A paste, as a browser delivers one.
 *
 * jsdom implements neither `DataTransfer` nor the `clipboardData` a
 * `ClipboardEvent` carries, so the clipboard is a stand-in answering the one
 * question the panel asks it: what does the clipboard hold in this format.
 */
const pasteEvent = (field: HTMLElement, formats: Record<string, string>) => {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => formats[type] ?? "" },
  });
  field.dispatchEvent(event);
  return event;
};

const paste = (field: HTMLElement, text: string) =>
  pasteEvent(field, { "text/plain": text });

/**
 * The DOM a browser leaves in a field when two lines are pasted into it.
 *
 * Verified in the running editor: copying two lines out of the script and
 * pressing Ctrl+V in the replace field leaves `<div>one</div><div>two</div>`,
 * whose `textContent` is "onetwo". jsdom has no editing model, so the shape has
 * to be built rather than performed.
 */
const pasteBlocks = (field: HTMLElement, lines: string[]) => {
  field.innerHTML = "";
  for (const line of lines) {
    const block = document.createElement("div");
    block.textContent = line;
    field.appendChild(block);
  }
  input(field);
};

/** The same two lines as the other shape a browser leaves: text and breaks. */
const pasteBreaks = (field: HTMLElement, lines: string[]) => {
  field.innerHTML = "";
  lines.forEach((line, i) => {
    if (i > 0) {
      field.appendChild(document.createElement("br"));
    }
    if (line) {
      field.appendChild(document.createTextNode(line));
    }
  });
  input(field);
};

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

describe("multi-line find and replace fields (#360)", () => {
  // Positive control. Green with or without the change: if it goes red the
  // harness has stopped driving the panel and nothing below means anything.
  it("still commits a single line typed into each field", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    type(replace, "hi");

    expect(getSearchQuery(view.state).search).toBe("hello");
    expect(getSearchQuery(view.state).replace).toBe("hi");
  });

  it("commits a two-line paste as two lines", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    pasteBlocks(replace, ["one", "two"]);

    expect(getSearchQuery(view.state).replace).toBe("one\ntwo");
  });

  // The ticket's own steps: paste two lines into replace, click Replace All.
  it("replaces every match with both pasted lines", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    pasteBlocks(replace, ["one", "two"]);
    control<HTMLButtonElement>(view, "replaceAll").click();

    expect(view.state.doc.toString()).toBe(
      ["one", "two world", "one", "two there", "one", "two", ""].join("\n"),
    );
  });

  it("commits line breaks left as <br> rather than as blocks", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    pasteBreaks(replace, ["one", "two"]);

    expect(getSearchQuery(view.state).replace).toBe("one\ntwo");
  });

  // A browser puts a break at the end of a field so the empty last line has a
  // height. Counting it would commit a trailing newline nobody entered, and
  // replace all would then push every following line down one.
  it("does not read the trailing filler break as a line", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    replace.innerHTML = "";
    replace.appendChild(document.createTextNode("hi"));
    replace.appendChild(document.createElement("br"));
    input(replace);

    expect(getSearchQuery(view.state).replace).toBe("hi");
  });

  // The same break with content after it is a line the user entered.
  it("reads a break followed by an empty line as a trailing newline", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    replace.innerHTML = "";
    replace.appendChild(document.createTextNode("hi"));
    replace.appendChild(document.createElement("br"));
    replace.appendChild(document.createElement("br"));
    input(replace);

    expect(getSearchQuery(view.state).replace).toBe("hi\n");
  });

  it("finds a pattern that spans two lines", () => {
    const view = mount();
    const { search } = fields(view);

    pasteBlocks(search, ["one", "two"]);

    expect(getSearchQuery(view.state).search).toBe("one\ntwo");
    // Line 3 and line 4 of the document, and the break between them.
    expect(view.state.selection.main.from).toBe(
      view.state.doc.line(3).from,
    );
    expect(view.state.selection.main.to).toBe(view.state.doc.line(4).to);
  });

  it("replaces a match that spans two lines", () => {
    const view = mount();
    const { search, replace } = fields(view);

    pasteBlocks(search, ["one", "two"]);
    type(replace, "joined");
    replaceAll(view);

    expect(view.state.doc.toString()).toBe(
      ["hello world", "hello there", "joined", ""].join("\n"),
    );
  });

  describe("entering a line break", () => {
    it("adds one where the caret is, on Ctrl+Enter", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "onetwo");
      caret(replace, 3);
      press(replace, "Enter", { ctrlKey: true });

      expect(getSearchQuery(view.state).replace).toBe("one\ntwo");
    });

    it("adds one on Cmd+Enter", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "onetwo");
      caret(replace, 3);
      press(replace, "Enter", { metaKey: true });

      expect(getSearchQuery(view.state).replace).toBe("one\ntwo");
    });

    // Enter on its own still belongs to the search, in both fields.
    it("is not what a bare Enter does", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "hi");
      press(replace, "Enter");

      expect(getSearchQuery(view.state).replace).toBe("hi");
      expect(view.state.doc.toString()).toBe(
        ["hi world", "hello there", "one", "two", ""].join("\n"),
      );
    });

    it("shows the break it added", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "onetwo");
      caret(replace, 3);
      press(replace, "Enter", { ctrlKey: true });

      // A newline inside a text node is not a line break the field can be
      // relied on to show; a <br> is one whatever the field's white-space is.
      expect(replace.querySelectorAll("br")).toHaveLength(1);
      expect(replace.textContent).toBe("onetwo");
    });
  });

  describe("pasting", () => {
    it("keeps the line breaks and commits them", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      const event = paste(replace, "one\ntwo");

      expect(event.defaultPrevented).toBe(true);
      expect(getSearchQuery(view.state).replace).toBe("one\ntwo");
      expect(replace.querySelectorAll("br")).toHaveLength(1);
    });

    it("reads Windows line endings as line breaks", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      paste(replace, "one\r\ntwo");

      expect(getSearchQuery(view.state).replace).toBe("one\ntwo");
    });

    it("drops the markup and keeps the text", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      pasteEvent(replace, {
        "text/plain": "plain",
        "text/html": "<b style='color:red'>bold</b>",
      });

      expect(getSearchQuery(view.state).replace).toBe("plain");
      expect(replace.querySelector("b")).toBeNull();
    });

    it("goes in at the caret, not at the end", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "ac");
      caret(replace, 1);
      paste(replace, "b");

      expect(getSearchQuery(view.state).replace).toBe("abc");
    });
  });

  // The panel rewrites both fields when an effect from outside changes the
  // query -- restoring a saved search, or `openSearchPanel` over a selection.
  // A value it cannot render is a value the user cannot see before running it.
  it("shows a multi-line value handed to it from outside", () => {
    const view = mount();
    const { replace } = fields(view);

    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({ search: "hello", replace: "one\ntwo" }),
      ),
    });

    expect(replace.querySelectorAll("br")).toHaveLength(1);
    expect(replace.textContent).toBe("onetwo");
    // And what it shows is what it commits back.
    input(replace);
    expect(getSearchQuery(view.state).replace).toBe("one\ntwo");
  });

  // Emptying a field leaves a break behind, and an element holding one is not
  // `:empty`, so the placeholder never returns. The field is only empty when
  // its text is.
  it("empties a field the user has cleared", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    type(replace, "hi");
    replace.innerHTML = "";
    replace.appendChild(document.createElement("br"));
    input(replace);

    expect(replace.childNodes).toHaveLength(0);
    expect(getSearchQuery(view.state).replace).toBe("");
  });

  // #367 keeps a hard space that was typed or pasted deliberately, and
  // normalizes only the ones a browser mints where a space would collapse. A
  // line break collapses whitespace beside it exactly as the field's own edge
  // does, so the same rule has to apply at the end of every line.
  it("normalizes a hardened space at the end of a line, not only of the field", () => {
    const view = mount(`hello \nworld\n`);
    const { search } = fields(view);

    pasteBreaks(search, [`hello${NBSP}`, "world"]);

    expect(getSearchQuery(view.state).search).toBe("hello \nworld");
    expect(view.state.selection.main.from).toBe(0);
  });

  it("still keeps a hard space in the middle of a line", () => {
    const view = mount(`hard${NBSP}space\nhere\n`);
    const { search } = fields(view);

    pasteBreaks(search, [`hard${NBSP}space`, "here"]);

    expect(getSearchQuery(view.state).search).toBe(`hard${NBSP}space\nhere`);
    expect(view.state.selection.main.from).toBe(0);
  });
});
