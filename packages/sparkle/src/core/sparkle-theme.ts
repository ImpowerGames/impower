import type { ThemeVariables } from "../../../sparkle-style-transformer/src/types/themeVariables";
import { getThemeVariables } from "../../../sparkle-style-transformer/src/utils/getThemeVariables";
import DEFAULT_SPARKLE_STYLES from "../constants/DEFAULT_SPARKLE_STYLES";

const variables = getThemeVariables(...Object.values(DEFAULT_SPARKLE_STYLES));

export const SPARKLE_THEME: ThemeVariables = variables;

export const setSparkleTheme = (styles: Record<string, string>): void => {
  variables.clear();
  for (const variable of getThemeVariables(...Object.values(styles))) {
    variables.add(variable);
  }
};
