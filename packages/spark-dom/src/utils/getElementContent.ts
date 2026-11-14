import type { ElementContent } from "../../../spark-engine/src/game/modules/ui/types/ElementContent";
import type { ThemeVariables } from "../../../sparkle-style-transformer/src/types/themeVariables";
import { getAnimationContent } from "./getAnimationContent";
import { getStyleContent } from "./getStyleContent";

export const getElementContent = (
  content: ElementContent,
  options: {
    breakpoints: Record<string, number>;
    scope?: string;
    theme: ThemeVariables;
  },
): string => {
  if (typeof content === "string") {
    return content;
  }
  if ("text" in content) {
    return content.text;
  }
  if ("styles" in content) {
    return getStyleContent(content.styles, options);
  }
  if ("animations" in content) {
    return getAnimationContent(content.animations, options.theme);
  }
  return "";
};
