/* eslint-disable no-cond-assign */
/* eslint-disable no-continue */
import { getIndentUnit } from "@codemirror/language";
import { RangeSet, RangeSetBuilder } from "@codemirror/rangeset";
import { Extension } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { IndentationWidget } from "./IndentationWidget";

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
  tabSize: number,
  builder: RangeSetBuilder<Decoration>
): void {
  let indentFrom = from;
  let indentTo = from;
  const indentEnd = from + indent - tabSize * 2;

  if (indentFrom - indentEnd === tabSize) {
    indentFrom = indentTo - tabSize;
    indentTo = indentFrom + tabSize;
    if (indentFrom > from) {
      builder.add(indentFrom, indentTo, indentationMark);
    }
  }
  while (indentFrom <= indentEnd) {
    indentFrom = indentTo;
    indentTo = indentFrom + tabSize;
    builder.add(indentFrom, indentTo, indentationMark);
  }
}

function makeIndentationWidget(
  from: number,
  to: number,
  indent: number,
  tabSize: number,
  builder: RangeSetBuilder<Decoration>
): void {
  const length = to - from;
  if (indent <= length) {
    // we only add widgets when the line length is less than the indentation guide
    // if the indent <= length we just use the indentationMark
    return;
  }
  const indents = [];
  const toFill = indent - length;
  let initialFill = toFill % tabSize;
  if (length < tabSize) {
    initialFill += length ? tabSize : 2 * tabSize;
  }
  if (initialFill) {
    indents.push(initialFill);
  }
  const quotient = (toFill - initialFill) / tabSize;
  indents.push(...Array(quotient).fill(tabSize));
  builder.add(to, to, IndentationWidget.create(indents));
}

function makeIndentationDecorators(view: EditorView): RangeSet<Decoration> {
  const tabSize = getIndentUnit(view.state);
  const builder = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;
  const spaceOnlyLines = [];
  let currentIndent = 0;
  view.visibleRanges.forEach((range) => {
    const visibleFrom = range?.from;
    const visibleTo = range?.to;
    let to = visibleFrom - 1;
    let pos;
    let from;
    let length;
    let text;
    while ((pos = to + 1) <= visibleTo) {
      ({ from, to, length, text } = doc.lineAt(pos));
      const codeStartsAt = getCodeStart(text);
      const isAllSpaces = codeStartsAt === length;
      // we don't have indentation guides for the zero/first indentation level
      const isComment = text.slice(codeStartsAt, codeStartsAt + 2) === "//";
      if (isAllSpaces) {
        spaceOnlyLines.push({ from, to });
        continue;
      }
      // we have a valid indentation that needs guiding!
      // fill all space only lines that we've kept track of
      const indent = codeStartsAt - (codeStartsAt % tabSize);
      if (!isComment) {
        currentIndent = indent;
      }
      for (let i = 0; i < spaceOnlyLines.length; i += 1) {
        const { from, to } = spaceOnlyLines[i];
        makeIndentationMark(from, to, currentIndent, tabSize, builder);
        makeIndentationWidget(from, to, currentIndent, tabSize, builder);
      }
      spaceOnlyLines.length = 0;
      makeIndentationMark(from, to, indent, tabSize, builder);
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
      if (update.docChanged || update.viewportChanged)
        this.decorations = makeIndentationDecorators(update.view);
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
    left: "2px",
    height: "100%",
    borderLeft: "1px solid rgba(193, 199, 249, 0.4)",
  },
});

export function indentationGuides(): Extension {
  return [showIndentations, indentationTheme];
}
