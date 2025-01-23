import { Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
} from "@codemirror/view";

const highlightExtraWhitespaceTheme = EditorView.baseTheme({
  ".cm-highlightSpace": {
    position: "relative",
    backgroundImage: "none",
    textIndent: "0",
  },
  ".cm-highlightSpace::before": {
    content: "attr(data-content)",
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    bottom: "0",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    opacity: "0.25",
  },
});

const tabDeco = Decoration.mark({ class: "cm-highlightTab" });

const getDecoration = (space: string) =>
  space == "\t"
    ? tabDeco
    : Decoration.mark({
        class: "cm-highlightSpace",
        attributes: { "data-content": "·" },
      });

function matcher(decorator: MatchDecorator): Extension {
  return ViewPlugin.define(
    (view) => ({
      decorations: decorator.createDeco(view),
      update(u): void {
        this.decorations = decorator.updateDeco(u, this.decorations);
      },
    }),
    {
      decorations: (v) => v.decorations,
    }
  );
}

const whitespaceHighlighter = matcher(
  new MatchDecorator({
    regexp: /\t|[ ](?=[ ])|(?<=[ ])[ ]|[ ]$/g,
    decoration: (match) => getDecoration(match[0]),
    boundary: /\S/,
  })
);

/// Returns an extension that highlights whitespace, adding a
/// `cm-highlightSpace` class to stretches of spaces, and a
/// `cm-highlightTab` class to individual tab characters. By default,
/// the former are shown as faint dots, and the latter as arrows.
export function highlightExtraWhitespace() {
  return [highlightExtraWhitespaceTheme, whitespaceHighlighter];
}
