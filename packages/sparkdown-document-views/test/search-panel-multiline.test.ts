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

/** Select a stretch of the field's first text node. */
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
  //
  // Also a positive control: reading with `textContent` ignored elements
  // altogether, so this was green before the change too, for a different
  // reason. It guards the rule rather than proving it.
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

  // A block element ends a line as surely as it starts one. Text dropped or
  // composed in beside a block leaves this shape, and reading it as one line
  // would join two lines the user can see are separate.
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

  // One line, however many elements are wrapped around it.
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

  // The browser's insert command writes newline characters rather than `<br>`,
  // and leaves one at the end that the field does not show. Measured in the
  // running editor: the field is 32px tall holding "abc" and 32px holding "abc"
  // and a trailing newline, against 55px for two lines. Committing that
  // newline made replace-all write a line break nobody entered -- seen in the
  // editor, where replacing "hello" with "abc" produced "abc\n world".
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

  // The one before the last is a line the user entered, and only the last is
  // the break the field does not show.
  it("reads all but the last of a run of trailing newlines", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    replace.innerHTML = "";
    replace.appendChild(document.createTextNode("abc\n\n"));
    input(replace);

    expect(getSearchQuery(view.state).replace).toBe("abc\n");
  });

  // A block already ends its line, so a newline at the end of its own text is
  // the invisible trailing break within it, not an empty line after it.
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

    // Enter on its own still belongs to the search, in both fields. A positive
    // control as well: this was green before the change, and it goes red only
    // if the new modifier handling has swallowed the plain key.
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

    // The caret at the very start is the case where the field's first child is
    // the break itself, so every position the caret can take sits before any
    // text there is. Repeating it stacks empty lines, which is where placing
    // the caret by counting characters is easiest to get wrong.
    it("adds one at the very start, twice over", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "hello");
      caret(replace, 0);
      press(replace, "Enter", { ctrlKey: true });

      expect(getSearchQuery(view.state).replace).toBe("\nhello");

      // Back to the start, which is now before a break rather than before any
      // text -- the position that has no text node to measure from.
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

    // Shift+Enter finds the previous match, and holding the modifier as well
    // must not quietly turn that into something else.
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

    // A clipboard holding only an image has no text to insert. The paste is
    // still refused, because the alternative is the browser putting the image
    // in a field whose whole content is a search pattern.
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

    // A paste goes in through the browser's own insert command, so the browser
    // records it and Ctrl+Z takes it back. jsdom implements no such command,
    // which is the case the fallback exists for and the one these tests
    // otherwise exercise; here the command is supplied so the path a browser
    // takes is the one under test.
    it("inserts through the browser's own command when there is one", () => {
      const view = mount();
      const { search, replace } = fields(view);
      const calls: unknown[][] = [];
      const doc = replace.ownerDocument as Document & {
        execCommand?: (...args: unknown[]) => boolean;
      };
      doc.execCommand = (...args: unknown[]) => {
        calls.push(args);
        // What the command does to the field, as a browser would leave it.
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

    // Two reviewers predicted that a browser might write a single newline for
    // a break, which reads as the invisible trailing one and would be lost.
    // Chromium writes two, measured in the running editor, so the break
    // survives there -- but nothing promises that, so a command that leaves
    // the value where it was is treated as a command that did not work.
    it("writes the field itself when the command changes nothing", () => {
      const view = mount();
      const { search, replace } = fields(view);
      const doc = replace.ownerDocument as Document & {
        execCommand?: (...args: unknown[]) => boolean;
      };
      // A browser whose insert leaves only the newline the reader treats as
      // the trailing break, so the field's value does not move.
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
      const doc = replace.ownerDocument as Document & {
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

      // jsdom defines no `execCommand`, so this is the fallback path.
      expect(
        (replace.ownerDocument as Document & { execCommand?: unknown })
          .execCommand,
      ).toBeUndefined();

      type(search, "hello");
      paste(replace, "one\ntwo");

      expect(getSearchQuery(view.state).replace).toBe("one\ntwo");
    });

    // Undo and redo replay the browser's own record of the field. Emptying the
    // field's leftover break underneath that record is what leaves a redo with
    // nothing to redo into, so it is left alone until the user edits again.
    it("does not tidy the field underneath an undo", () => {
      const view = mount();
      const { search, replace } = fields(view);

      type(search, "hello");
      type(replace, "hi");
      // What a browser leaves when an undo takes the text back out.
      replace.innerHTML = "";
      replace.appendChild(document.createElement("br"));
      replace.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "historyUndo" }),
      );

      expect(replace.childNodes).toHaveLength(1);
      expect(getSearchQuery(view.state).replace).toBe("");
      // The leftover break stays, so the browser's record of the field keeps
      // pointing at something, and the placeholder still comes back.
      expect(replace.hasAttribute("data-empty")).toBe(true);
    });

    // The placeholder is drawn on a field with no content at all, which a field
    // holding that leftover break is not. The attribute says it is empty
    // without emptying it.
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

      // And it goes as soon as there is something to show again.
      type(replace, "back");
      expect(replace.hasAttribute("data-empty")).toBe(false);
    });

    // Without a clipboard there is nothing to read, and taking the event over
    // would leave the user with a paste that does nothing at all.
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
  // its text is. The fourth positive control: the old emptiness check agreed
  // on this case, so it guards against the new one having lost the behaviour.
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

  // jsdom applies no styling, so nothing here can prove what the field looks
  // like. What it can prove is that the rules are still declared -- and one of
  // them is load-bearing: without preserved whitespace the field would display
  // an indented replacement with its indent collapsed away, showing the user
  // one string while the document receives another. That is the defect this
  // whole change exists to end, so it is worth a guard against the rule being
  // dropped. It was looked at in the running editor; this only pins the rule.
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
