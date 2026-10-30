import {
  openSearchPanel,
  SearchQuery,
  selectNextOccurrence,
} from "@codemirror/search";
import { EditorState, Extension, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EDITOR_EXTENSIONS from "../src/modules/script-editor/constants/EDITOR_EXTENSIONS";
import {
  COUNT_INTERVAL,
  customSearchPanel,
} from "../src/modules/script-editor/utils/extensions/customSearch";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const LINES = 400;
const DOC = Array.from(
  { length: LINES },
  (_, i) => `line ${i} hello there friend`,
).join("\n");

let walks = 0;
let steps = 0;
const realGetCursor = SearchQuery.prototype.getCursor;

const settle = () => vi.advanceTimersByTimeAsync(COUNT_INTERVAL * 2);

const countWalks = async (body: () => void) => {
  walks = 0;
  steps = 0;
  body();
  await settle();
  return { walks, steps };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  SearchQuery.prototype.getCursor = function (
    this: SearchQuery,
    ...args: Parameters<SearchQuery["getCursor"]>
  ) {
    walks++;
    const cursor = realGetCursor.apply(this, args);
    const next = cursor.next.bind(cursor);
    cursor.next = () => {
      steps++;
      return next();
    };
    return cursor;
  };
});

const unrelated = StateEffect.define<number>();

let view: EditorView | undefined;

const mount = (doc = DOC, extra: Extension[] = []) => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [customSearchPanel(), ...extra],
    }),
    parent,
  });
  openSearchPanel(view);
  return view;
};

const type = (field: HTMLElement, text: string) => {
  field.textContent = text;
  field.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
  field.dispatchEvent(new InputEvent("input", { bubbles: true }));
  field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
};

const panelOf = (view: EditorView) =>
  view.dom.querySelector(".cm-panel.cm-search");

const fields = (view: EditorView) => {
  const panel = panelOf(view);
  expect(panel).toBeTruthy();
  return {
    search: panel!.querySelector<HTMLElement>('[name="search"]')!,
    replace: panel!.querySelector<HTMLElement>('[name="replace"]')!,
  };
};

const control = <T extends HTMLElement>(view: EditorView, name: string) => {
  const el = panelOf(view)!.querySelector<T>(`[name="${name}"]`);
  expect(el).toBeTruthy();
  return el!;
};

const label = (view: EditorView) =>
  panelOf(view)!.querySelector(".cm-search-matches-label")!.textContent;

const search = async (view: EditorView, text: string) => {
  type(fields(view).search, text);
  await settle();
};

afterEach(() => {
  SearchQuery.prototype.getCursor = realGetCursor;
  vi.useRealTimers();
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

describe("search panel match count (#359)", () => {
  it("counts the matches of what is typed into the find field", async () => {
    const view = mount();

    const cost = await countWalks(() => type(fields(view).search, "hello"));

    expect(label(view)).toBe(`1 of ${LINES}`);
    expect(cost.steps).toBeGreaterThan(LINES);
  });

  it("does not walk the document when the replace field is typed into", async () => {
    const view = mount();
    await search(view, "hello");
    const { replace } = fields(view);

    const cost = await countWalks(() => {
      type(replace, "h");
      type(replace, "hi");
      type(replace, "hi!");
    });

    expect(cost).toEqual({ walks: 0, steps: 0 });
    expect(label(view)).toBe(`1 of ${LINES}`);
  });

  it("does not walk the document for an unrelated effect", async () => {
    const view = mount();
    await search(view, "hello");

    const cost = await countWalks(() => {
      view.dispatch({ effects: unrelated.of(1) });
      view.dispatch({
        effects: [unrelated.of(2), unrelated.of(3), unrelated.of(4)],
      });
    });

    expect(cost).toEqual({ walks: 0, steps: 0 });
    expect(label(view)).toBe(`1 of ${LINES}`);
  });

  it("walks the document at most once for a burst of edits", async () => {
    const view = mount();
    await search(view, "hello");

    const cost = await countWalks(() => {
      for (let i = 0; i < 10; i++) {
        view.dispatch({
          changes: { from: 0, insert: "hello\n" },
          effects: [unrelated.of(i), unrelated.of(i)],
        });
      }
    });

    expect(cost.walks).toBe(1);
    expect(label(view)).toBe(`11 of ${LINES + 10}`);
  });

  it("does not walk inside a document edit, but recounts afterwards", async () => {
    const view = mount();
    await search(view, "hello");
    expect(label(view)).toBe(`1 of ${LINES}`);

    walks = 0;
    view.dispatch({ changes: { from: 0, insert: "hello hello\n" } });
    expect(walks).toBe(0);
    expect(label(view)).toBe(`1 of ${LINES}`);

    await settle();

    expect(walks).toBe(1);
    expect(label(view)).toBe(`3 of ${LINES + 2}`);
  });

  const selectMatchOnLine = (view: EditorView, line: number) => {
    const target = view.state.doc.line(line);
    const at = target.from + target.text.indexOf("hello");
    view.dispatch({ selection: { anchor: at, head: at + "hello".length } });
  };

  it("renumbers immediately when the selection moves to another match", async () => {
    const view = mount();
    await search(view, "hello");
    expect(label(view)).toBe(`1 of ${LINES}`);

    walks = 0;
    selectMatchOnLine(view, 3);

    expect(label(view)).toBe(`3 of ${LINES}`);
    expect(walks).toBe(0);
  });

  it("numbers the first, middle and last match, and neither side of one", async () => {
    const view = mount();
    await search(view, "hello");

    walks = 0;

    selectMatchOnLine(view, 1);
    expect(label(view)).toBe(`1 of ${LINES}`);

    selectMatchOnLine(view, LINES / 2);
    expect(label(view)).toBe(`${LINES / 2} of ${LINES}`);

    selectMatchOnLine(view, LINES);
    expect(label(view)).toBe(`${LINES} of ${LINES}`);

    view.dispatch({ selection: { anchor: 0 } });
    expect(label(view)).toBe(`1 of ${LINES}`);

    const second = view.state.doc.line(2);
    view.dispatch({ selection: { anchor: second.from, head: second.to } });
    expect(label(view)).toBe(`1 of ${LINES}`);

    expect(walks).toBe(0);
  });

  it("recounts when a search toggle changes which ranges match", async () => {
    const view = mount();
    const toggle = async (name: string, on: boolean) => {
      const el = control<HTMLInputElement>(view, name);
      el.checked = on;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    };

    await search(view, "HELLO");
    expect(label(view)).toBe(`1 of ${LINES}`);

    await toggle("case", true);
    expect(label(view)).toBe("No results");

    await toggle("case", false);
    expect(label(view)).toBe(`1 of ${LINES}`);

    await search(view, "ell");
    expect(label(view)).toBe(`1 of ${LINES}`);

    await toggle("word", true);
    expect(label(view)).toBe("No results");
  });

  it("puts the cursor on the first match, past the 1000-match ceiling", async () => {
    const many = 1200;
    const view = mount(
      Array.from({ length: many }, (_, i) => `line ${i} hello there`).join("\n"),
    );
    await search(view, "hello");
    await search(view, "hello");

    const line = view.state.doc.line(1);
    const at = line.from + line.text.indexOf("hello");

    expect(label(view)).toBe(`1 of ${many}`);
    expect(view.state.selection.ranges.length).toBe(1);
    expect(view.state.selection.main.from).toBe(at);
    expect(view.state.selection.main.to).toBe(at + "hello".length);
  });

  it("keeps every range of a multi-range selection", () => {
    const view = mount(DOC, [EditorState.allowMultipleSelections.of(true)]);
    const line = view.state.doc.line(1);
    const at = line.from + line.text.indexOf("hello");
    view.dispatch({ selection: { anchor: at, head: at + "hello".length } });

    selectNextOccurrence(view);
    selectNextOccurrence(view);

    expect(view.state.selection.ranges.length).toBe(3);
  });

  it("collapses a multi-range selection without the opt-in", () => {
    const view = mount();
    const line = view.state.doc.line(1);
    const at = line.from + line.text.indexOf("hello");
    view.dispatch({ selection: { anchor: at, head: at + "hello".length } });

    selectNextOccurrence(view);
    selectNextOccurrence(view);

    expect(view.state.selection.ranges.length).toBe(1);
  });

  it("has multiple selections enabled in the editor's extensions", () => {
    const state = EditorState.create({
      doc: DOC,
      extensions: [EDITOR_EXTENSIONS],
    });

    expect(state.facet(EditorState.allowMultipleSelections)).toBe(true);
  });

  it("clears the count when the pattern becomes an invalid regex", async () => {
    const view = mount();
    await search(view, "hello");
    expect(label(view)).toBe(`1 of ${LINES}`);

    const re = control<HTMLInputElement>(view, "re");
    re.checked = true;
    re.dispatchEvent(new Event("change", { bubbles: true }));
    await search(view, "**bold**");

    expect(panelOf(view)).toBeTruthy();
    expect(label(view)).toBe("");

    type(fields(view).replace, "x");
    await settle();

    expect(panelOf(view)).toBeTruthy();
    expect(label(view)).toBe("");
  });

  it("does not count after the panel is destroyed", async () => {
    const view = mount();
    await search(view, "hello");

    walks = 0;
    view.dispatch({ changes: { from: 0, insert: "hello\n" } });
    view.destroy();
    await settle();

    expect(walks).toBe(0);
  });
});
