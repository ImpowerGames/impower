import { EditorSelection, EditorState, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIT_CLASS,
  litBlockWidgets,
} from "../src/modules/screenplay-preview/utils/litBlockWidgets";

class Block extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  override eq(other: Block) {
    return other.label === this.label;
  }
  toDOM() {
    const element = document.createElement("div");
    element.dataset["label"] = this.label;
    element.textContent = this.label;
    return element;
  }
}

const build = (state: EditorState) => {
  const ranges = [];
  for (let n = 2; n <= state.doc.lines; n += 2) {
    const line = state.doc.line(n);
    ranges.push(
      Decoration.replace({ widget: new Block(`L${n}`), block: true }).range(
        line.from,
        line.to,
      ),
    );
  }
  return Decoration.set(ranges);
};

const blocks = StateField.define<DecorationSet>({
  create: (state) => build(state),
  update: (_value, tr) => build(tr.state),
  provide: (field) => EditorView.decorations.from(field),
});

const lines = (count: number) =>
  Array.from({ length: count }, (_, i) => `Line number ${i + 1}.`).join("\n");

const views: EditorView[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => {
    const parent = view.dom.parentElement;
    view.destroy();
    parent?.remove();
  });
  vi.restoreAllMocks();
});

const create = (doc: string, head: number) => {
  const parent = document.body.appendChild(document.createElement("div"));
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(head),
      extensions: [blocks, litBlockWidgets],
    }),
  });
  views.push(view);
  return view;
};

const litLabels = (view: EditorView) =>
  Array.from(
    view.contentDOM.querySelectorAll<HTMLElement>(`.${LIT_CLASS}`),
    (element) => element.dataset["label"],
  );

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("litBlockWidgets", () => {
  it("lights the widget under the head after a replacement shrinks the document", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = create(lines(40), 0);
    await settle();
    const shorter = lines(3);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: shorter },
      selection: EditorSelection.cursor(shorter.indexOf("\n") + 1),
    });
    await settle();
    const crashes = errors.mock.calls.filter((call) =>
      String(call[0]).includes("plugin crashed"),
    );
    expect(crashes).toEqual([]);
    expect(litLabels(view)).toEqual(["L2"]);
  });

  it("moves the lit class with the selection head", async () => {
    const view = create(lines(6), 0);
    await settle();
    view.dispatch({
      selection: EditorSelection.cursor(view.state.doc.line(4).from),
    });
    await settle();
    expect(litLabels(view)).toEqual(["L4"]);
    view.dispatch({
      selection: EditorSelection.cursor(view.state.doc.line(2).from),
    });
    await settle();
    expect(litLabels(view)).toEqual(["L2"]);
  });
});
