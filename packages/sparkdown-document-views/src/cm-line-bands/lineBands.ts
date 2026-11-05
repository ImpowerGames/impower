import { EditorState } from "@codemirror/state";
import { EditorView, LayerMarker, layer } from "@codemirror/view";
import { highlightsField } from "../cm-highlight-lines/highlightLines";

export const CURRENT_LINE_CLASS_NAME = "cm-current-line-band";
export const ROUTE_CLASS_NAME = "cm-route-rule";

const RULE_WIDTH = 3;

class BandMarker implements LayerMarker {
  constructor(
    readonly className: string,
    readonly left: number,
    readonly top: number,
    readonly width: number,
    readonly height: number,
  ) {}

  draw() {
    const elt = document.createElement("div");
    elt.className = this.className;
    this.adjust(elt);
    return elt;
  }

  update(elt: HTMLElement, prev: BandMarker) {
    if (prev.className !== this.className) {
      return false;
    }
    this.adjust(elt);
    return true;
  }

  adjust(elt: HTMLElement) {
    elt.style.left = `${this.left}px`;
    elt.style.top = `${this.top}px`;
    elt.style.width = `${this.width}px`;
    elt.style.height = `${this.height}px`;
  }

  eq(other: BandMarker) {
    return (
      this.className === other.className &&
      this.left === other.left &&
      this.top === other.top &&
      this.width === other.width &&
      this.height === other.height
    );
  }
}

export const getRouteLineRuns = (state: EditorState): [number, number][] => {
  const highlights = state.field(highlightsField, false);
  if (!highlights || state.doc.length === 0) {
    return [];
  }
  const lineNumbers: number[] = [];
  const iter = highlights.iter(0);
  while (iter.value) {
    lineNumbers.push(state.doc.lineAt(iter.from).number);
    iter.next();
  }
  const runs: [number, number][] = [];
  for (const lineNumber of lineNumbers) {
    const last = runs[runs.length - 1];
    if (last && lineNumber <= last[1] + 1) {
      last[1] = Math.max(last[1], lineNumber);
    } else {
      runs.push([lineNumber, lineNumber]);
    }
  }
  return runs;
};

const bandMarkers = (view: EditorView): BandMarker[] => {
  const scroller = view.scrollDOM;
  const rect = scroller.getBoundingClientRect();
  const offsetTop =
    (view.documentTop - rect.top) / view.scaleY + scroller.scrollTop;
  const left = scroller.scrollLeft;
  const width = scroller.clientWidth;
  const markers: BandMarker[] = [];
  for (const [first, last] of getRouteLineRuns(view.state)) {
    const top = view.lineBlockAt(view.state.doc.line(first).from).top;
    const bottom = view.lineBlockAt(view.state.doc.line(last).from).bottom;
    markers.push(
      new BandMarker(
        ROUTE_CLASS_NAME,
        left,
        offsetTop + top,
        RULE_WIDTH,
        bottom - top,
      ),
    );
  }
  const current = view.lineBlockAt(view.state.selection.main.head);
  markers.push(
    new BandMarker(
      CURRENT_LINE_CLASS_NAME,
      left,
      offsetTop + current.top,
      width,
      current.height,
    ),
  );
  return markers;
};

const lineBandsTheme = EditorView.baseTheme({
  [`.${CURRENT_LINE_CLASS_NAME}`]: {
    backgroundColor: "var(--syntax-active)",
    boxShadow: `inset ${RULE_WIDTH}px 0 var(--accent)`,
  },
  [`.${ROUTE_CLASS_NAME}`]: {
    backgroundColor: "color-mix(in srgb, var(--muted) 30%, transparent)",
  },
});

export const lineBands = () => [
  layer({
    above: false,
    class: "cm-line-bands",
    markers: bandMarkers,
    update: (update) =>
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      update.geometryChanged ||
      update.startState.field(highlightsField, false) !==
        update.state.field(highlightsField, false),
  }),
  lineBandsTheme,
];

