import { bracketMatching, MatchResult } from "@codemirror/language";
import {
  combineConfig,
  EditorState,
  Extension,
  Facet,
} from "@codemirror/state";
import { Decoration } from "@codemirror/view";

export interface VSCodeBracketMatchingConfig {}

export const vscodeBracketMatchingConfig = Facet.define<
  VSCodeBracketMatchingConfig,
  Required<VSCodeBracketMatchingConfig>
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

const matchingMark = Decoration.mark({ class: "cm-matchingBracket" });
const nonmatchingMark = Decoration.mark({ class: "cm-nonmatchingBracket" });

const LEADING_WHITESPACE_REGEX = /^\s*/;

function trimWhitespace(from: number, to: number, state: EditorState) {
  const text = state.sliceDoc(from, to);

  // Find leading whitespace length
  const leadMatch = text.match(LEADING_WHITESPACE_REGEX);
  const leadOffset = leadMatch ? leadMatch[0].length : 0;

  // Find trailing whitespace length
  // We trim the right side and compare lengths to get the offset
  const trailOffset = text.length - text.trimEnd().length;

  // If the bracket is entirely whitespace, we shouldn't "disappear" it
  if (leadOffset === text.length) {
    return { from, to };
  }

  return {
    from: from + leadOffset,
    to: to - trailOffset,
  };
}

function renderMatch(match: MatchResult, state: EditorState) {
  const decorations = [];

  const mark = match.matched ? matchingMark : nonmatchingMark;

  const startBracket = trimWhitespace(match.start.from, match.start.to, state);
  if (startBracket.from < startBracket.to) {
    decorations.push(mark.range(startBracket.from, startBracket.to));
  }

  if (match.end) {
    const endBracket = trimWhitespace(match.end.from, match.end.to, state);
    if (endBracket.from < endBracket.to) {
      decorations.push(mark.range(endBracket.from, endBracket.to));
    }
  }

  return decorations;
}

export function vscodeBracketMatching(
  config: VSCodeBracketMatchingConfig,
): Extension {
  return [
    bracketMatching({
      renderMatch,
    }),
    vscodeBracketMatchingConfig.of(config),
  ];
}
