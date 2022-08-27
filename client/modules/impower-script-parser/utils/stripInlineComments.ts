export const stripInlineComments = (str: string): string => {
  let inlineCommentIndex = -1;
  let lastStringMark = "";
  for (let i = 0; i < str.length; i += 1) {
    const c = str[i];
    if (!lastStringMark && c === "/" && str[i + 1] === "/") {
      inlineCommentIndex = i;
    }
    if (c === `"`) {
      if (lastStringMark === `"`) {
        lastStringMark = "";
      } else if (!lastStringMark) {
        lastStringMark = c;
      }
    }
    if (c === "'") {
      if (lastStringMark === "'") {
        lastStringMark = "";
      } else if (!lastStringMark) {
        lastStringMark = c;
      }
    }
    if (c === "`") {
      if (lastStringMark === "`") {
        lastStringMark = "";
      } else if (!lastStringMark) {
        lastStringMark = c;
      }
    }
  }
  if (inlineCommentIndex >= 0) {
    str = str.slice(0, inlineCommentIndex);
  }
  return str;
};
