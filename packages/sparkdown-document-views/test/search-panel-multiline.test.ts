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
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";
import { customSearchPanel } from "../src/modules/script-editor/utils/extensions/customSearch";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

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

const input = (field: HTMLElement) => {
  field.dispatchEvent(new InputEvent("input", { bubbles: true }));
  field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
};

const type = (field: HTMLElement, text: string) => {
  field.textContent = text;
  input(field);
};

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

const select = (field: HTMLElement, from: number, to: number) => {
  const node = field.firstChild!;
  const range = document.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
};

const press = (field: HTMLElement, key: string, init: KeyboardEventInit = {}) =>
  field.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
  );

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

const pasteBlocks = (field: HTMLElement, lines: string[]) => {
  field.innerHTML = "";
  for (const line of lines) {
    const block = document.createElement("div");
    block.textContent = line;
    field.appendChild(block);
  }
  input(field);
};

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

  it("reads a line break between a block and the text beside it", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    replace.innerHTML = "";
    replace.appendChild(document.createTextNode("a"));
    const block = document.createElement("div");
    block.textContent = "b";
    replace.appendChild(block);
    replace.appendChild(document.createTextNode("c"));
    input(replace);

    expect(getSearchQuery(view.state).replace).toBe("a\nb\nc");
  });

  it("reads nested blocks as one line, not two", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    replace.innerHTML = "";
    const first = document.createElement("div");
    first.textContent = "first";
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    inner.textContent = "second";
    outer.appendChild(inner);
    replace.append(first, outer);
    input(replace);

    expect(getSearchQuery(view.state).replace).toBe("first\nsecond");
  });

  it("does not read a trailing newline character as a line", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    replace.innerHTML = "";
    replace.appendChild(document.createTextNode("abc\n"));
    input(replace);

    expect(getSearchQuery(view.state).replace).toBe("abc");

    control<HTMLButtonElement>(view, "replaceAll").click();

    expect(view.state.doc.toString()).toBe(
      ["abc world", "abc there", "one", "two", ""].join("\n"),
    );
  });

  it("reads all but the last of a run of trailing newlines", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    replace.innerHTML = "";
    replace.appendChild(document.createTextNode("abc\n\n"));
    input(replace);

    expect(getSearchQuery(view.state).replace).toBe("abc\n");
  });

  it("does not put an empty line after a block whose text ends in a newline", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    replace.innerHTML = "";
    const block = document.createElement("div");
    block.appendChild(document.createTextNode("inside\n"));
    replace.appendChild(block);
    replace.appendChild(document.createTextNode("after"));
    input(replace);

    expect(getSearchQuery(view.state).replace).toBe("inside\nafter");
  });

  it("keeps a newline character in the middle of the text", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    replace.innerHTML = "";
    replace.appendChild(document.createTextNode("one\n    two\n"));
    input(replace);

    expect(getSearchQuery(view.state).replace).toBe("one\n    two");
  });

  it("finds a pattern that spans two lines", () => {
    const view = mount();
    const { search } = fields(view);

    pasteBlocks(search, ["one", "two"]);

    expect(getSearchQuery(view.state).search).toBe("one\ntwo");
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

    it("adds one at the very start, twice over", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "hello");
      caret(replace, 0);
      press(replace, "Enter", { ctrlKey: true });

      expect(getSearchQuery(view.state).replace).toBe("\nhello");

      caret(replace, 0);
      press(replace, "Enter", { ctrlKey: true });

      expect(getSearchQuery(view.state).replace).toBe("\n\nhello");
    });

    it("adds one to an empty field", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      replace.focus();
      press(replace, "Enter", { ctrlKey: true });

      expect(getSearchQuery(view.state).replace).toBe("\n");
    });

    it("leaves Ctrl+Shift+Enter to the search", () => {
      const view = mount();
      const { search } = fields(view);

      type(search, "hello");
      const first = view.state.selection.main.from;
      press(search, "Enter", { ctrlKey: true, shiftKey: true });

      expect(getSearchQuery(view.state).search).toBe("hello");
      expect(search.querySelectorAll("br")).toHaveLength(0);
      expect(view.state.selection.main.from).not.toBe(first);
    });

    it("shows the break it added", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "onetwo");
      caret(replace, 3);
      press(replace, "Enter", { ctrlKey: true });

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

    it("replaces the text the user had selected", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "hello");
      select(replace, 1, 4);
      paste(replace, "X");

      expect(getSearchQuery(view.state).replace).toBe("hXo");
    });

    it("replaces a selection with more than one line", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "hello");
      select(replace, 1, 4);
      paste(replace, "X\nY");

      expect(getSearchQuery(view.state).replace).toBe("hX\nYo");
    });

    it("reads a bare carriage return as a line break", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      paste(replace, "one\rtwo");

      expect(getSearchQuery(view.state).replace).toBe("one\ntwo");
    });

    it("refuses a paste with no text in it, and changes nothing", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "hi");
      const event = pasteEvent(replace, { "text/html": "<img src='x'>" });

      expect(event.defaultPrevented).toBe(true);
      expect(getSearchQuery(view.state).replace).toBe("hi");
      expect(replace.textContent).toBe("hi");
    });

    it("inserts through the browser's own command when there is one", () => {
      const view = mount();
      const { search, replace } = fields(view);
      const calls: unknown[][] = [];
      const doc = replace.ownerDocument as Omit<Document, "execCommand"> & {
        execCommand?: (...args: unknown[]) => boolean;
      };
      doc.execCommand = (...args: unknown[]) => {
        calls.push(args);
        replace.appendChild(document.createTextNode(String(args[2])));
        replace.dispatchEvent(new InputEvent("input", { bubbles: true }));
        return true;
      };
      try {
        type(search, "hello");
        paste(replace, "pasted");

        expect(calls).toEqual([["insertText", false, "pasted"]]);
        expect(getSearchQuery(view.state).replace).toBe("pasted");
      } finally {
        delete doc.execCommand;
      }
    });

    it("writes the field itself when the command changes nothing", () => {
      const view = mount();
      const { search, replace } = fields(view);
      const doc = replace.ownerDocument as Omit<Document, "execCommand"> & {
        execCommand?: (...args: unknown[]) => boolean;
      };
      doc.execCommand = () => {
        replace.appendChild(document.createTextNode("\n"));
        replace.dispatchEvent(new InputEvent("input", { bubbles: true }));
        return true;
      };
      try {
        type(search, "hello");
        type(replace, "abc");
        caret(replace, 3);
        press(replace, "Enter", { ctrlKey: true });

        expect(getSearchQuery(view.state).replace).toBe("abc\n");
      } finally {
        delete doc.execCommand;
      }
    });

    it("writes the field itself when the command reports failure", () => {
      const view = mount();
      const { search, replace } = fields(view);
      const doc = replace.ownerDocument as Omit<Document, "execCommand"> & {
        execCommand?: (...args: unknown[]) => boolean;
      };
      doc.execCommand = () => false;
      try {
        type(search, "hello");
        paste(replace, "one\ntwo");

        expect(getSearchQuery(view.state).replace).toBe("one\ntwo");
      } finally {
        delete doc.execCommand;
      }
    });

    it("falls back to writing the field where there is no such command", () => {
      const view = mount();
      const { search, replace } = fields(view);

      expect(
        (replace.ownerDocument as Document & { execCommand?: unknown })
          .execCommand,
      ).toBeUndefined();

      type(search, "hello");
      paste(replace, "one\ntwo");

      expect(getSearchQuery(view.state).replace).toBe("one\ntwo");
    });

    it("does not tidy the field underneath an undo", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "hi");
      replace.innerHTML = "";
      replace.appendChild(document.createElement("br"));
      replace.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "historyUndo" }),
      );

      expect(replace.childNodes).toHaveLength(1);
      expect(getSearchQuery(view.state).replace).toBe("");
      expect(replace.hasAttribute("data-empty")).toBe(true);
    });

    it("says a field is empty for the placeholder without emptying it", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "hi");
      expect(replace.hasAttribute("data-empty")).toBe(false);

      replace.innerHTML = "";
      replace.appendChild(document.createElement("br"));
      replace.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "historyUndo" }),
      );

      expect(replace.hasAttribute("data-empty")).toBe(true);

      type(replace, "back");
      expect(replace.hasAttribute("data-empty")).toBe(false);
    });

    it("leaves a paste carrying no clipboard to the browser", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "hi");
      const event = new Event("paste", { bubbles: true, cancelable: true });
      replace.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(getSearchQuery(view.state).replace).toBe("hi");
    });
  });

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
    input(replace);
    expect(getSearchQuery(view.state).replace).toBe("one\ntwo");
  });

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

  it("normalizes a hardened space at the end of a line, not only of the field", () => {
    const view = mount(`hello \nworld\n`);
    const { search } = fields(view);

    pasteBreaks(search, [`hello${NBSP}`, "world"]);

    expect(getSearchQuery(view.state).search).toBe("hello \nworld");
    expect(view.state.selection.main.from).toBe(0);
  });

  it("declares the whitespace and height rules the fields depend on", () => {
    const panel = EDITOR_THEME["& .cm-panel.cm-search"] as Record<
      string,
      Record<string, string>
    >;
    const fieldRules =
      panel["& [contenteditable][name='search'], & [contenteditable][name='replace']"];

    expect(fieldRules).toBeTruthy();
    expect(fieldRules!["whiteSpace"]).toBe("pre-wrap");
    expect(fieldRules!["maxHeight"]).toBeTruthy();
    expect(fieldRules!["overflowY"]).toBe("auto");
  });

  it("still keeps a hard space in the middle of a line", () => {
    const view = mount(`hard${NBSP}space\nhere\n`);
    const { search } = fields(view);

    pasteBreaks(search, [`hard${NBSP}space`, "here"]);

    expect(getSearchQuery(view.state).search).toBe(`hard${NBSP}space\nhere`);
    expect(view.state.selection.main.from).toBe(0);
  });
});
