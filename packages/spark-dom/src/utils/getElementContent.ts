import type { ElementContent } from "../../../spark-engine/src/game/modules/ui/types/ElementContent";
import { getAnimationContent } from "./getAnimationContent";
import { getFontContent } from "./getFontContent";
import { getStyleContent } from "./getStyleContent";

export const getElementContent = (
  content: ElementContent,
  options?: {
    breakpoints?: Record<string, number>;
    scope?: string;
  }
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
  if ("fonts" in content) {
    return getFontContent(content.fonts);
  }
  if ("animations" in content) {
    return getAnimationContent(content.animations);
  }
  return "";
};
