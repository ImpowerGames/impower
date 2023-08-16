import { ConfigDefinition } from "../types/ConfigDefinition";
import { LanguageData } from "../types/LanguageData";

const convertConfigToLanguageData = (
  config: ConfigDefinition
): LanguageData => {
  // process language data
  const comments = config?.comments;
  const autoClosingPairs = config?.autoClosingPairs ?? [];
  const surroundingPairs = config?.surroundingPairs ?? [];
  const wordChars = config?.wordChars;

  const data: LanguageData = {};

  if (comments) {
    data.commentTokens = {
      block: {
        open: comments.blockComment?.[0],
        close: comments.blockComment?.[1],
      },
      line: comments.lineComment,
    };
  }

  if (autoClosingPairs) {
    data.closeBrackets = {
      brackets: autoClosingPairs.map(({ open }) => open),
      before: autoClosingPairs.map(({ close }) => close).join(""),
    };
  }

  if (surroundingPairs) {
    const surroundBrackets = surroundingPairs.filter(
      ([surroundOpen]) =>
        !autoClosingPairs.some(({ open }) => surroundOpen === open)
    );
    data.surroundBrackets = {
      brackets: surroundBrackets.map(([open]) => open!),
      before: surroundBrackets.map(([_, close]) => close!).join(""),
    };
  }

  if (wordChars) {
    data.wordChars = wordChars;
  }

  return data;
};

export default convertConfigToLanguageData;
