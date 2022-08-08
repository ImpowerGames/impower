/* eslint-disable no-cond-assign */
/* eslint-disable no-continue */
import { getIndentUnit } from "@codemirror/language";
import { Extension, RangeSet, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { colors } from "../constants/colors";

// markers can be used at positions on a line over a range
const indentationMark = Decoration.mark({ class: "cm-indentation-guide" });

const SPACES = /^\s*/;

function getCodeStart(text: string): number {
  return text.match(SPACES)?.[0].length;
}

function makeIndentationMark(
  from: number,
  to: number,
  indent: number,
  tabSize: number
): [number, number, Decoration][] {
  let indentFrom = from;
  let indentTo = from;
  const indentEnd = from + indent - tabSize * 2;
  const decos: [number, number, Decoration][] = [];

  if (indentFrom - indentEnd === tabSize) {
    indentFrom = indentTo - tabSize;
    indentTo = indentFrom + tabSize;
    if (indentFrom > from) {
      decos.push([indentFrom, indentTo, indentationMark]);
    }
  }
  while (indentFrom <= indentEnd) {
    indentFrom = indentTo;
    indentTo = indentFrom + tabSize;
    decos.push([indentFrom, indentTo, indentationMark]);
  }
  return decos;
}

function makeIndentationDecorators(view: EditorView): RangeSet<Decoration> {
  const tabSize = getIndentUnit(view.state);
  const builder = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;
  const spaceOnlyLines = [];
  view.visibleRanges.forEach((range) => {
    const visibleFrom = range?.from;
    const visibleTo = range?.to;
    let to = visibleFrom - 1;
    let pos;
    let from;
    let text;
    while ((pos = to + 1) <= visibleTo) {
      ({ from, to, text } = doc.lineAt(pos));
      const codeStartsAt = getCodeStart(text);
      // we have a valid indentation that needs guiding!
      // fill all space only lines that we've kept track of
      const indent = codeStartsAt - (codeStartsAt % tabSize);
      const decos: Map<number, [number, number, Decoration]> = new Map();
      spaceOnlyLines.length = 0;
      makeIndentationMark(from, to, indent, tabSize).forEach(
        ([from, to, deco]) => {
          decos[from] = [from, to, deco];
        }
      );
      Object.values(decos)
        .sort((a, b) => a[0] - b[0])
        .forEach(([from, to, mark]) => {
          builder.add(from, to, mark);
        });
    }
  });
  return builder.finish();
}

const showIndentations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = makeIndentationDecorators(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = makeIndentationDecorators(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

const indentationTheme = EditorView.baseTheme({
  ".cm-indentation-widget": {
    display: "inline-block",
  },
  ".cm-indentation-guide": {
    position: "relative",
    height: "100%",
    display: "inline-block",
  },
  ".cm-indentation-guide:after": {
    position: "absolute",
    content: "''",
    top: "-4px",
    left: "0",
    height: "100%",
    opacity: 0.25,
    borderLeft: `1px solid ${colors.keyword}`,
  },
});

export function indentationGuides(): Extension {
  return [showIndentations, indentationTheme];
}
