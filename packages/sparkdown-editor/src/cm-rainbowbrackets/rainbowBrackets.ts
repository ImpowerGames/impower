/**
 * Based on rainbowBrackets <https://github.com/eriknewland/rainbowbrackets>
 *
 * Copyright (c) 2023 eriknewland
 * Released under the MIT License.
 */

import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

const DEFAULT_BRACKETS = "()[]{}";
const DEFAULT_MATCHING_BRACKET_COLORS = ["#ffd700", "#da70d6", "#179fff"];
const DEFAULT_NONMATCHING_BRACKET_COLOR = "rgba(255, 18, 18, 0.8)";

const DEFAULT_CONFIG = {
  brackets: DEFAULT_BRACKETS,
  matchingBracketColors: DEFAULT_MATCHING_BRACKET_COLORS,
  nonmatchingBracketColor: DEFAULT_NONMATCHING_BRACKET_COLOR,
};

const getMatchingBracket = (closingBracket: string, brackets: string) => {
  const closeIndex = brackets.indexOf(closingBracket);
  const openIndex = closeIndex - 1;
  return brackets[openIndex];
};

const rainbowBracketsPlugin = (config: typeof DEFAULT_CONFIG) =>
  ViewPlugin.fromClass(
    class {
      matchingMarks: Decoration[];

      nonmatchingMark: Decoration;

      decorations: DecorationSet;

      constructor(view: EditorView) {
        const matchingBracketColors = config.matchingBracketColors;
        this.matchingMarks = matchingBracketColors.map((_, i) =>
          Decoration.mark({
            class: `cm-matchingBracket-colored-${i}`,
          })
        );
        this.nonmatchingMark = Decoration.mark({
          class: `cm-nonmatchingBracket-colored`,
        });
        this.decorations = this.getBracketDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = this.getBracketDecorations(update.view);
        }
      }

      getBracketDecorations(view: EditorView) {
        const { doc } = view.state;
        const decorations = [];
        const stack: { type: string; from: number }[] = [];
        const brackets = config.brackets;
        const matchingMarks = this.matchingMarks;
        const nonmatchingMark = this.nonmatchingMark;

        for (let pos = 0; pos < doc.length; pos += 1) {
          const char = doc.sliceString(pos, pos + 1);
          const bracketIndex = brackets.indexOf(char);
          const isOpenBracket = bracketIndex >= 0 && bracketIndex % 2 === 0;
          const isCloseBracket = bracketIndex >= 0 && bracketIndex % 2 !== 0;
          if (isOpenBracket) {
            stack.push({ type: char, from: pos });
          } else if (isCloseBracket) {
            const open = stack.pop();
            if (open && open.type === getMatchingBracket(char, brackets)) {
              const colorIndex =
                stack.length % config.matchingBracketColors.length;
              const matchingMark = matchingMarks[colorIndex]!;
              decorations.push(
                matchingMark.range(open.from, open.from + 1),
                matchingMark.range(pos, pos + 1)
              );
            }
          }
        }
        while (stack.length > 0) {
          const hangingBracket = stack.pop();
          if (hangingBracket) {
            decorations.push(
              nonmatchingMark.range(
                hangingBracket.from,
                hangingBracket.from + 1
              )
            );
          }
        }

        decorations.sort((a, b) => a.from - b.from);

        return Decoration.set(decorations);
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );

const rainbowBrackets = (config = DEFAULT_CONFIG) => {
  const spec: Record<string, any> = {};
  config.matchingBracketColors.forEach((value, i) => {
    spec[`& .cm-matchingBracket-colored-${i}`] = { color: value };
    spec[`& .cm-matchingBracket-colored-${i} > span`] = { color: value };
  });
  spec[`& .cm-nonmatchingBracket-colored`] = {
    color: config.nonmatchingBracketColor,
  };
  spec[`& .cm-nonmatchingBracket-colored > span`] = {
    color: config.nonmatchingBracketColor,
  };
  return [rainbowBracketsPlugin(config), EditorView.baseTheme(spec)];
};

export default rainbowBrackets;
