const COMMENT_OR_STRING =
  /\/\*[\s\S]*?(?:\*\/|$)|"(?:[^"\\]|\\[\s\S])*(?:"|$)|'(?:[^'\\]|\\[\s\S])*(?:'|$)/g;

const THEME_VARIABLE_DECLARATION = /(?:^|[{;])\s*(--theme-[\w-]+)\s*:/g;

export const getThemeVariables = (...cssTexts: string[]): Set<string> => {
  const variables = new Set<string>();
  for (const cssText of cssTexts) {
    const code = cssText.replace(COMMENT_OR_STRING, " ");
    for (const match of code.matchAll(THEME_VARIABLE_DECLARATION)) {
      variables.add(match[1]!);
    }
  }
  return variables;
};
