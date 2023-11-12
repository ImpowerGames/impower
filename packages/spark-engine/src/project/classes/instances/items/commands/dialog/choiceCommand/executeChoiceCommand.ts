import { format } from "../../../../../../../../../spark-evaluate/src";
import { SparkGame, Writer } from "../../../../../../../game";
import { ChoiceCommandData } from "./ChoiceCommandData";

export const executeChoiceCommand = (
  game: SparkGame,
  data?: ChoiceCommandData | undefined,
  context?:
    | {
        valueMap: Record<string, unknown>;
        typeMap: { [type: string]: Record<string, any> };
      }
    | undefined,
  index?: number,
  onClick?: () => void
): void => {
  const content = data?.params?.content || "";
  const order = data?.params?.order || 0;
  const operator = data?.params?.operator;

  const valueMap = context?.valueMap || {};
  const typeMap = context?.typeMap || {};
  const structName = "DISPLAY";
  const writerConfigs = typeMap?.["writer"] as Record<string, Writer>;
  const config = writerConfigs?.["choice"];

  const contentEls = game.ui.findAllUIElements(
    structName,
    config?.className || "Choice"
  );
  const [replaceTagsResult] = format(content, valueMap);
  const [evaluatedContent] = format(replaceTagsResult, valueMap);
  const handleClick = (e?: { stopPropagation: () => void }): void => {
    if (e) {
      e.stopPropagation();
    }
    contentEls.forEach((el) => {
      if (el) {
        el.replaceChildren();
        el.style["pointerEvents"] = null;
        el.style["display"] = "none";
      }
    });
    onClick?.();
  };
  if (!data) {
    contentEls.forEach((el) => {
      if (el) {
        // Clear all buttons
        el.replaceChildren();
        el.style["pointerEvents"] = null;
        el.style["display"] = "none";
      }
    });
    return;
  }
  const lastContentEl = contentEls?.[contentEls.length - 1];
  if (lastContentEl) {
    const parentEl = game.ui.getParent(lastContentEl);
    if (parentEl) {
      const validIndex = index != null ? index : order;
      for (let i = 0; i < Math.max(contentEls.length, validIndex + 1); i += 1) {
        const el =
          contentEls?.[i] || parentEl?.cloneChild(contentEls.length - 1);
        if (el) {
          if (operator === "end") {
            // Clear all unnecessary buttons
            if (index != null && i >= index) {
              el.replaceChildren();
              el.style["pointerEvents"] = null;
              el.style["display"] = "none";
            }
          } else {
            if (validIndex === i) {
              el.onclick = handleClick;
              el.textContent = evaluatedContent;
              el.style["pointerEvents"] = "auto";
              el.style["display"] = "block";
            }
          }
        }
      }
    }
  }
};
