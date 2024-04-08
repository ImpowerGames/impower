import { Extension } from "@codemirror/state";
import { Decoration, MatchDecorator, ViewPlugin } from "@codemirror/view";

const WhitespaceDeco = new Map<string, Decoration>();

function getWhitespaceDeco(space: string): Decoration {
  let deco = WhitespaceDeco.get(space);
  if (!deco)
    WhitespaceDeco.set(
      space,
      (deco = Decoration.mark({
        attributes:
          space === "\t"
            ? {
                class: "cm-highlightTab",
              }
            : {
                class: "cm-highlightSpace",
                "data-display": space.replace(/[ ]/g, "·"),
                style: "text-indent: 0;",
              },
      }))
    );
  return deco;
}

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
    regexp: /[ ]{2,}/g,
    decoration: (match) => getWhitespaceDeco(match[0]),
    boundary: /\S/,
  })
);

/// Returns an extension that highlights whitespace, adding a
/// `cm-highlightSpace` class to stretches of spaces, and a
/// `cm-highlightTab` class to individual tab characters. By default,
/// the former are shown as faint dots, and the latter as arrows.
export function whitespaceMarkers() {
  return whitespaceHighlighter;
}
