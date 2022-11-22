import { format } from "../../../../../../../../../spark-evaluate";
import { ChoiceCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { ChoiceCommandConfig } from "./ChoiceCommandConfig";

export const defaultChoiceCommandConfig: ChoiceCommandConfig = {
  choice: {
    className: "Choice",
  },
};

export const executeChoiceCommand = (
  game: SparkGame,
  data?: ChoiceCommandData | undefined,
  context?:
    | {
        valueMap: Record<string, unknown>;
        objectMap: Record<string, Record<string, unknown>>;
      }
    | undefined,
  index?: number,
  onClick?: () => void
): void => {
  const content = data?.content || "";
  const order = data?.order || 0;
  const operator = data?.operator;

  const valueMap = context?.valueMap || {};
  const objectMap = context?.objectMap || {};
  const commandConfig = objectMap?.["config"]?.["CHOICE"]
    ? (objectMap?.["CHOICE"] as ChoiceCommandConfig)
    : undefined;
  const validCommandConfig = commandConfig || defaultChoiceCommandConfig;
  const structName = "DISPLAY";

  const contentEls = game.ui.findAllUIElements(
    structName,
    validCommandConfig?.choice?.className
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
