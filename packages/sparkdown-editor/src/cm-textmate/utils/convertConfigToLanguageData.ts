import { ConfigDefinition } from "../types/ConfigDefinition";
import { LanguageData } from "../types/LanguageData";

const convertConfigToLanguageData = (
  config: ConfigDefinition
): LanguageData => {
  // process language data
  const comments = config?.comments;
  const autoClosingPairs = config?.autoClosingPairs;
  const autoCloseBefore = config?.autoCloseBefore;
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
  if (autoClosingPairs || autoCloseBefore) {
    data.closeBrackets = {
      brackets: autoClosingPairs?.map(({ open }) => open),
      before: autoCloseBefore,
    };
  }
  if (wordChars) {
    data.wordChars = wordChars;
  }

  return data;
};

export default convertConfigToLanguageData;
