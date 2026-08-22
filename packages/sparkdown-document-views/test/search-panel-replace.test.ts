import {
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
} from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  COUNT_INTERVAL,
  customSearchPanel,
} from "../src/modules/script-editor/utils/extensions/customSearch";

/**
 * jsdom implements `Range` but none of its geometry, and CodeMirror measures
 * text by asking a `Range` for its client rects on an animation frame. Any test
 * here that waits stays alive long enough for that frame to run, so the missing
 * method would arrive as an uncaught error. An empty list is what a layout
 * engine that does no layout honestly reports, and CodeMirror already falls
 * back to a default character width when it sees one.
 */
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

/** Wait for the panel's trailing match count to have run. */
const counted = () =>
  new Promise((resolve) => setTimeout(resolve, COUNT_INTERVAL * 2));

const DOC = [
  "hello world",
  "hello there",
  "hello friend",
  "test replace",
  "test replace",
  "",
].join("\n");

/**
 * The space a contenteditable under `white-space: normal` hardens a typed space
 * into. Built from its char code rather than written out: as a literal it is
 * indistinguishable from a space in every editor, terminal and diff, which is
 * the property that makes the bug it stands for so hard to see.
 */
const NBSP = String.fromCharCode(0xa0);

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

/**
 * The panel's fields are `contenteditable` divs, not `<input>`s, so there is no
 * `value` to assign and no `change` event to fire.
 *
 * Both `input` and `keyup` are dispatched because either is a legitimate place
 * to hang the commit -- upstream `@codemirror/search` uses `keyup`, the find
 * field here uses both. Asserting on the pair keeps these tests pinned to
 * "typing here reaches the query" rather than to one particular wiring.
 *
 * What this cannot reproduce: jsdom has no contenteditable editing model, so a
 * real browser's `<br>` residue, multi-node text, space hardening and IME
 * composition never happen on their own. Where a test needs one of those DOM
 * shapes it builds it explicitly.
 */
const type = (field: HTMLElement, text: string) => {
  field.textContent = text;
  field.dispatchEvent(new InputEvent("input", { bubbles: true }));
  field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
};

const panelOf = (view: EditorView) =>
  view.dom.querySelector(".cm-panel.cm-search");

const fields = (view: EditorView) => {
  const panel = panelOf(view);
  expect(panel).toBeTruthy();
  const search = panel!.querySelector<HTMLElement>('[name="search"]');
  const replace = panel!.querySelector<HTMLElement>('[name="replace"]');
  expect(search).toBeTruthy();
  expect(replace).toBeTruthy();
  return { search: search!, replace: replace! };
};

const control = <T extends HTMLElement>(view: EditorView, name: string) => {
  const el = panelOf(view)!.querySelector<T>(`[name="${name}"]`);
  expect(el).toBeTruthy();
  return el!;
};

const replaced = (...lines: string[]) => [...lines, ""].join("\n");

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

describe("search panel replace field (#358)", () => {
  // Positive control. Passes with or without the fix by design: if it goes red
  // the harness has stopped driving the panel at all, and the failures below
  // say nothing about the replace field.
  it("commits what is typed into the find field", () => {
    const view = mount();
    const { search } = fields(view);

    type(search, "hello");

    expect(getSearchQuery(view.state).search).toBe("hello");
  });

  it("commits what is typed into the replace field", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    type(replace, "hi");

    expect(getSearchQuery(view.state).replace).toBe("hi");
  });

  // Committing a query carries the replacement text; it does not apply it.
  // Worth pinning explicitly because the replace field commits on every
  // keystroke, which puts a keystroke on the same path a replacement travels --
  // and the failure mode is a script quietly rewriting itself as it is typed
  // into. Only the two buttons and Enter may reach the document.
  it("does not touch the document while a query or replacement is typed", () => {
    const view = mount();
    const { search, replace } = fields(view);

    // `type` dispatches input and keyup; the panel also has a keydown handler,
    // so ordinary keys go through that too.
    const press = (field: HTMLElement, text: string, key: string) => {
      type(field, text);
      field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    };

    press(search, "hello", "o");
    press(replace, "h", "h");
    press(replace, "hi", "i");
    press(replace, "hi ", " ");
    press(replace, "hi there", "e");

    expect(view.state.doc.toString()).toBe(DOC);
    expect(getSearchQuery(view.state).replace).toBe("hi there");
  });

  it("replaces from the replace field only once Enter is pressed", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    type(replace, "hi");
    expect(view.state.doc.toString()).toBe(DOC);

    replace.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    expect(view.state.doc.toString()).toBe(
      replaced(
        "hi world",
        "hello there",
        "hello friend",
        "test replace",
        "test replace",
      ),
    );
  });

  // The ticket's literal path: type both fields, then click the panel's own
  // button. Calling `replaceAll(view)` directly leaves that wiring untested.
  it("replaces all matches when the replace all button is clicked", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    type(replace, "hi");
    control<HTMLButtonElement>(view, "replaceAll").click();

    expect(view.state.doc.toString()).toBe(
      replaced("hi world", "hi there", "hi friend", "test replace", "test replace"),
    );
  });

  it("replaces a single match with the replace field's text", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    type(replace, "hi");
    // `replaceNext` rewrites the match the selection is already sitting on, and
    // committing the query put it on the first one, so a single call is a
    // single replacement.
    replaceNext(view);

    expect(view.state.doc.toString()).toBe(
      replaced(
        "hi world",
        "hello there",
        "hello friend",
        "test replace",
        "test replace",
      ),
    );
  });

  it("uses the replace field's current text, not an earlier one", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    type(replace, "hi");
    type(replace, "howdy");
    replaceAll(view);

    expect(view.state.doc.toString()).toBe(
      replaced(
        "howdy world",
        "howdy there",
        "howdy friend",
        "test replace",
        "test replace",
      ),
    );
  });

  // The ticket's second symptom: a replacement typed, carried into the query by
  // a later find-field edit, then deleted, came back from the dead. The
  // intervening find edit is the load-bearing step -- without it nothing ever
  // committed the stale value and the sequence proves nothing.
  it("does not resurrect a replacement the user deleted", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    type(replace, "hi");
    type(search, "hello ");
    type(replace, "");
    replaceAll(view);

    expect(getSearchQuery(view.state).replace).toBe("");
    expect(view.state.doc.toString()).toBe(
      replaced("world", "there", "friend", "test replace", "test replace"),
    );
  });

  // Also green before the fix -- editing the find field always committed
  // whatever the replace field happened to hold, which is the one path by which
  // a replacement ever reached the query. Kept as a guard that the new
  // commit-on-input did not break it, not as coverage of the defect.
  it("keeps the replace text when the find field is edited afterwards", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(replace, "hi");
    type(search, "hello");

    expect(getSearchQuery(view.state).replace).toBe("hi");

    type(search, "test");
    replaceAll(view);

    expect(view.state.doc.toString()).toBe(
      replaced("hello world", "hello there", "hello friend", "hi replace", "hi replace"),
    );
  });

  // Verified in the running editor: typing "hi there " into the replace field
  // leaves textContent char codes ending in 160, and replace all wrote that
  // non-breaking space into the script -- invisible, and a hard space in the
  // sparkdown source. jsdom never hardens a space on its own, so the field is
  // given the content Chromium would have left.
  it("reads a hardened space in the replace field back as a space", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    type(replace, `hi${NBSP}there`);

    expect(getSearchQuery(view.state).replace).toBe("hi there");

    replaceAll(view);

    const doc = view.state.doc.toString();
    expect(doc).not.toContain(NBSP);
    expect(doc).toBe(
      replaced(
        "hi there world",
        "hi there there",
        "hi there friend",
        "test replace",
        "test replace",
      ),
    );
  });

  // Same hardening seen from the other side: it made a find that ends in a
  // space match nothing at all.
  it("finds text typed with a hardened trailing space", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, `hello${NBSP}`);
    type(replace, `hi${NBSP}`);

    expect(getSearchQuery(view.state).search).toBe("hello ");
    expect(getSearchQuery(view.state).replace).toBe("hi ");

    replaceAll(view);

    const doc = view.state.doc.toString();
    expect(doc).not.toContain(NBSP);
    expect(doc).toBe(
      replaced("hi world", "hi there", "hi friend", "test replace", "test replace"),
    );
  });

  // Counting matches builds a search cursor, and building one for an invalid
  // regex throws. Committing on replace-field input is what puts a keystroke on
  // that path: the panel survives being opened over a selection holding regex
  // metacharacters, so the first thing to trip it is this commit.
  //
  // The count runs on a trailing timer, so the wait is what makes this test
  // mean anything -- without it the assertions land before the count has been
  // attempted and the guard is never reached at all.
  it("survives a keystroke while the find pattern is an invalid regex", async () => {
    const view = mount();
    const { search, replace } = fields(view);
    const re = control<HTMLInputElement>(view, "re");

    re.checked = true;
    re.dispatchEvent(new Event("change", { bubbles: true }));
    type(search, "**bold**");
    await counted();

    expect(panelOf(view)).toBeTruthy();

    type(replace, "x");
    await counted();

    expect(panelOf(view)).toBeTruthy();
    expect(view.dom.querySelector(".cm-panels")).toBeTruthy();
    expect(getSearchQuery(view.state).replace).toBe("x");
  });

  // The panel rewrites both fields from the query when an outside effect
  // changes it. Committing on every keystroke must not turn that into a
  // self-inflicted rewrite: in a browser, replacing the field's text node
  // collapses the caret to the start on every character. jsdom cannot observe a
  // caret, so what is pinned here is the node identity that would be destroyed.
  // The caret itself was checked by typing a 13-character replacement into the
  // running editor and reading it back in order.
  it("does not rewrite the replace field's node while typing", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    const node = document.createTextNode("hi");
    replace.replaceChildren(node);
    replace.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(replace.firstChild).toBe(node);
    expect(getSearchQuery(view.state).replace).toBe("hi");
  });
});
