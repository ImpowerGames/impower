import {
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
} from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { customSearchPanel } from "../src/modules/script-editor/utils/extensions/customSearch";

const DOC = [
  "hello world",
  "hello there",
  "hello friend",
  "test replace",
  "test replace",
  "",
].join("\n");

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
 * `value` to assign and no synthetic `change` to fire. Typing into one produces
 * exactly this: the text lands in the node, then an `input` event. Anything the
 * panel needs from a keystroke has to hang off that event.
 */
const type = (field: HTMLElement, text: string) => {
  field.textContent = text;
  field.dispatchEvent(new InputEvent("input", { bubbles: true }));
};

const fields = (view: EditorView) => {
  const panel = view.dom.querySelector(".cm-panel.cm-search");
  expect(panel).toBeTruthy();
  const search = panel!.querySelector<HTMLElement>('[name="search"]');
  const replace = panel!.querySelector<HTMLElement>('[name="replace"]');
  expect(search).toBeTruthy();
  expect(replace).toBeTruthy();
  return { search: search!, replace: replace! };
};

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

describe("search panel replace field (#358)", () => {
  // Positive control. If this goes red the harness stopped driving the panel at
  // all, and the failures below say nothing about the replace field.
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

  it("replaces all matches with the replace field's text", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    type(replace, "hi");
    replaceAll(view);

    expect(view.state.doc.toString()).toBe(
      ["hi world", "hi there", "hi friend", "test replace", "test replace", ""].join("\n"),
    );
  });

  it("replaces a single match with the replace field's text", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello");
    type(replace, "hi");
    // replaceNext only rewrites a match the selection is already sitting on, so
    // from a bare cursor the first call selects and the second replaces.
    replaceNext(view);
    replaceNext(view);

    expect(view.state.doc.toString()).toBe(
      [
        "hi world",
        "hello there",
        "hello friend",
        "test replace",
        "test replace",
        "",
      ].join("\n"),
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
      [
        "howdy world",
        "howdy there",
        "howdy friend",
        "test replace",
        "test replace",
        "",
      ].join("\n"),
    );
  });

  it("deletes matches when the replace field is emptied", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(search, "hello ");
    type(replace, "hi ");
    type(replace, "");
    replaceAll(view);

    expect(getSearchQuery(view.state).replace).toBe("");
    expect(view.state.doc.toString()).toBe(
      ["world", "there", "friend", "test replace", "test replace", ""].join("\n"),
    );
  });

  it("keeps the replace text when the find field is edited afterwards", () => {
    const view = mount();
    const { search, replace } = fields(view);

    type(replace, "hi");
    type(search, "hello");

    expect(getSearchQuery(view.state).replace).toBe("hi");

    type(search, "test");
    replaceAll(view);

    expect(view.state.doc.toString()).toBe(
      ["hello world", "hello there", "hello friend", "hi replace", "hi replace", ""].join(
        "\n",
      ),
    );
  });

  // The panel writes the field back from the query when an outside effect
  // changes it. Committing on every keystroke must not turn that into a
  // self-inflicted rewrite, which would reset the caret to the start of the
  // field on every character typed.
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
