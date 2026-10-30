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

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

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

  it("does not touch the document while a query or replacement is typed", () => {
    const view = mount();
    const { search, replace } = fields(view);

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

  it("finds a hard space already in the script (interior NBSP pasted into find)", () => {
    const view = mount(`hard${NBSP}space here\nsoft space here\n`);
    const { search, replace } = fields(view);

    type(search, `hard${NBSP}space`);
    expect(getSearchQuery(view.state).search).toBe(`hard${NBSP}space`);

    type(replace, "found");
    replaceAll(view);

    expect(view.state.doc.toString()).toBe(`found here\nsoft space here\n`);
  });

  it("still normalizes a hardened space inside a typed space run", () => {
    const view = mount(`a  b\n`);
    const { search } = fields(view);

    type(search, `a ${NBSP}b`);

    expect(getSearchQuery(view.state).search).toBe("a  b");
  });

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
