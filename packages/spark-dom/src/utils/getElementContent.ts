import type { ElementContent } from "../../../spark-engine/src/game/modules/ui/types/ElementContent";
import { getImportContent } from "./getImportContent";
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
  if ("import" in content) {
    return getImportContent(content.import);
  }
  return "";
};
