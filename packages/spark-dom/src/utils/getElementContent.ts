import type { ElementContent } from "../../../spark-engine/src/game/modules/ui/types/ElementContent";
import { getAnimationContent } from "./getAnimationContent";
import { getFontContent } from "./getFontContent";
import { getStyleContent } from "./getStyleContent";

export const getElementContent = (content: ElementContent): string => {
  if (typeof content === "string") {
    return content;
  }
  if ("text" in content) {
    return content.text;
  }
  if ("style" in content) {
    return getStyleContent(content.style);
  }
  if ("fonts" in content) {
    return getFontContent(content.fonts);
  }
  if ("animations" in content) {
    return getAnimationContent(content.animations);
  }
  return "";
};
