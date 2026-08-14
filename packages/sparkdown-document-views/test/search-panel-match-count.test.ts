import { openSearchPanel, SearchQuery } from "@codemirror/search";
import { EditorState, Extension, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EDITOR_EXTENSIONS from "../src/modules/script-editor/constants/EDITOR_EXTENSIONS";
import {
  COUNT_INTERVAL,
  customSearchPanel,
} from "../src/modules/script-editor/utils/extensions/customSearch";

/**
 * jsdom implements `Range` but none of its geometry, and CodeMirror measures
 * text by asking a `Range` for its client rects on an animation frame. These
 * tests are the first in this package to stay alive long enough for that frame
 * to run, so the missing method arrives as an uncaught error rather than a
 * failed assertion.
 *
 * An empty list is the honest answer from a layout engine that does no layout,
 * and it is one CodeMirror already handles -- it falls back to its default
 * character width.
 */
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

/**
 * Long enough that a walk over it is unmistakable in the counters below, short
 * enough to stay a fast test. Every line holds one "hello", so the match count
 * is the line count and an off-by-one in the walk would show up as a wrong
 * label rather than a silently equal one.
 */
const LINES = 400;
const DOC = Array.from(
  { length: LINES },
  (_, i) => `line ${i} hello there friend`,
).join("\n");

/**
 * Counting matches means asking the query for a cursor and running it to the
 * end of the document. That walk is the cost this file is about, so it is
 * measured directly: `walks` is how many cursors were opened, `steps` how many
 * matches were visited across them. Counting beats timing here -- a machine
 * under load can hide a real regression, and these numbers cannot.
 *
 * What they see is `SearchQuery.getCursor`, which is the call the match count
 * is built on. They do NOT see `SearchQuery.matchAll`, which reaches
 * `stringCursor`/`regexpCursor` directly: `selectMatches` scans the document
 * that way on every find-field keystroke, and none of it registers below.
 */
let walks = 0;
let steps = 0;
const realGetCursor = SearchQuery.prototype.getCursor;

/**
 * The count runs on a trailing timer, so every assertion has to outlast it.
 * Waiting is what makes the "did not walk" tests mean anything: without it they
 * would pass on any implementation at all, simply by reading the counters
 * before the walk had had a chance to happen.
 *
 * The clock is driven rather than waited on -- only `setTimeout` is faked, so
 * CodeMirror's own scheduling still runs, and the file costs milliseconds
 * instead of the ten seconds of real sleeping the same assertions would need.
 */
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

/**
 * Like the typing helper in search-panel-replace.test.ts, plus the `keydown`
 * that file has no need for. It is load-bearing here: `keydown` is what routes
 * a find-field keystroke into the panel's own handler, and that handler is half
 * of what a keystroke there costs.
 */
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

/** Type a query and wait for the count it asks for to arrive. */
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
  // Positive control. Green before and after the fix by design: if it goes red
  // the panel is not counting at all, and every "did not walk" assertion below
  // becomes vacuously true.
  it("counts the matches of what is typed into the find field", async () => {
    const view = mount();

    const cost = await countWalks(() => type(fields(view).search, "hello"));

    expect(label(view)).toBe(`1 of ${LINES}`);
    // A whole-document walk, not the one-step cursor the panel's keydown
    // handler opens to find the first match.
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
    // The replacement still reached the query, and the count still stands.
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

  // The pre-fix panel walked the document once per effect, so an unrelated
  // transaction cost whatever number of effects it happened to carry.
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
    // The cursor is sitting on what was the first match, and ten new matches
    // were inserted in front of it, so it is now the eleventh.
    expect(label(view)).toBe(`11 of ${LINES + 10}`);
  });

  // Typing into the script is the hot path this whole ticket is about: it must
  // not carry the walk. The count still has to arrive, just not inside the
  // keystroke.
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
    // Two matches went in ahead of the one the cursor is on, so its number
    // moves as well as the total.
    expect(label(view)).toBe(`3 of ${LINES + 2}`);
  });

  /** Select the "hello" on the given 1-based line. */
  const selectMatchOnLine = (view: EditorView, line: number) => {
    const target = view.state.doc.line(line);
    const at = target.from + target.text.indexOf("hello");
    view.dispatch({ selection: { anchor: at, head: at + "hello".length } });
  };

  // Moving between matches changes the "N" and nothing else. It has to land
  // immediately: `next` and `previous` highlight a match, and a number that
  // renumbers a quarter-second later describes a match the user has already
  // moved off. Asserting before any `settle()` is the whole point of this test.
  it("renumbers immediately when the selection moves to another match", async () => {
    const view = mount();
    await search(view, "hello");
    expect(label(view)).toBe(`1 of ${LINES}`);

    walks = 0;
    selectMatchOnLine(view, 3);

    expect(label(view)).toBe(`3 of ${LINES}`);
    // And without walking the document again to find that out.
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

    // A bare cursor at the very start of the document sits inside no match, and
    // a selection wider than a match is not inside it either. Both read as "1",
    // which is what the label showed before the user landed on anything.
    view.dispatch({ selection: { anchor: 0 } });
    expect(label(view)).toBe(`1 of ${LINES}`);

    const second = view.state.doc.line(2);
    view.dispatch({ selection: { anchor: second.from, head: second.to } });
    expect(label(view)).toBe(`1 of ${LINES}`);

    expect(walks).toBe(0);
  });

  // `search` is not the only field that moves matches. A fix that compared only
  // the search text would leave the count reading the old pattern's total.
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

    // Whole-word is the other toggle that moves matches without the search
    // text changing: "ell" sits inside "hello" and is never a word of its own.
    await search(view, "ell");
    expect(label(view)).toBe(`1 of ${LINES}`);

    await toggle("word", true);
    expect(label(view)).toBe("No results");
  });

  // Typing a query moves the cursor onto the first match and leaves every other
  // match highlighted rather than selected -- CodeMirror draws those
  // decorations for the visible ranges alone, which is what keeps showing them
  // independent of how long the script is.
  //
  // The ceiling is the point: `selectMatches`, which used to do this, gives up
  // above 1,000 matches and left the cursor wherever it was. That is precisely
  // the feature-length script this panel exists to search.
  it("puts the cursor on the first match, past the 1000-match ceiling", async () => {
    const many = 1200;
    const view = mount(
      Array.from({ length: many }, (_, i) => `line ${i} hello there`).join("\n"),
    );
    // Twice, because the handler runs before the field's own `input` commits:
    // the first keystroke into a fresh panel still sees the empty query, and
    // the second is the one that has a pattern to look for.
    await search(view, "hello");
    await search(view, "hello");

    const line = view.state.doc.line(1);
    const at = line.from + line.text.indexOf("hello");

    expect(label(view)).toBe(`1 of ${many}`);
    expect(view.state.selection.ranges.length).toBe(1);
    expect(view.state.selection.main.from).toBe(at);
    expect(view.state.selection.main.to).toBe(at + "hello".length);
  });

  // The "all" button, `Mod-d`, rectangular selection and ctrl-click all
  // dispatch selections holding more than one range, and @codemirror/state
  // reduces every one of those to its main range unless the editor opts in.
  // Without the opt-in the button is inert and nothing says so.
  it("selects every match when the all button is used", async () => {
    const view = mount(DOC, [EditorState.allowMultipleSelections.of(true)]);
    await search(view, "hello");

    control<HTMLButtonElement>(view, "select").click();

    expect(view.state.selection.ranges.length).toBe(LINES);
  });

  // The editor's own extension list is what has to carry the opt-in, not this
  // file's harness -- a test that supplies it itself would stay green with the
  // real editor left inert.
  it("has multiple selections enabled in the editor's extensions", () => {
    const state = EditorState.create({
      doc: DOC,
      extensions: [EDITOR_EXTENSIONS],
    });

    expect(state.facet(EditorState.allowMultipleSelections)).toBe(true);
  });

  // Guards the #358 fix from the other side: skipping work must not skip the
  // `valid` check that keeps an invalid regex from throwing out of the count.
  // The throw now comes from a timer, with no CodeMirror frame above it, so it
  // no longer takes the panel down -- which is exactly why this asserts on the
  // label instead. Counting from a standing count is what makes it
  // discriminating: with the guard the label clears, and without it the throw
  // happens before anything is written and the old number stays on screen.
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

    // And a replace keystroke over that invalid pattern stays harmless.
    type(fields(view).replace, "x");
    await settle();

    expect(panelOf(view)).toBeTruthy();
    expect(label(view)).toBe("");
  });

  // A timer that outlives the view would count against a destroyed editor.
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
