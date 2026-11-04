const THEME_VARIABLE_DECLARATION = /(--theme-[\w-]+)\s*:/g;

export const getThemeVariables = (...cssTexts: string[]): Set<string> => {
  const variables = new Set<string>();
  for (const cssText of cssTexts) {
    for (const match of cssText.matchAll(THEME_VARIABLE_DECLARATION)) {
      variables.add(match[1]!);
    }
  }
  return variables;
};
