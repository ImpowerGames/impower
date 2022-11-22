import { format } from "../../../../../../../../../spark-evaluate";
import { ChoiceCommandData } from "../../../../../../../data";
import { SparkGame, loadStyles, loadUI } from "../../../../../../../game";
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
  count?: number,
  onClick?: () => void
): void => {
  const content = data?.content || "";
  const order = data?.order || 0;

  const valueMap = context?.valueMap || {};
  const objectMap = context?.objectMap || {};
  const commandConfig = objectMap?.["config"]?.["_choice"]
    ? (objectMap?.["_choice"] as ChoiceCommandConfig)
    : undefined;
  const validCommandConfig = commandConfig || defaultChoiceCommandConfig;
  const structName = "Display";

  loadStyles(game, objectMap, ...Object.keys(objectMap?.["style"] || {}));
  loadUI(game, objectMap, structName);

  const validIndex = index != null ? index : order;
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
      for (let i = 0; i < Math.max(contentEls.length, validIndex + 1); i += 1) {
        const el =
          contentEls?.[i] || parentEl?.cloneChild(contentEls.length - 1);
        if (el) {
          if (validIndex === i) {
            el.onclick = handleClick;
            el.textContent = evaluatedContent;
            el.style["pointerEvents"] = "auto";
            el.style["display"] = "block";
          }
          if (count != null) {
            if (i >= count) {
              el.replaceChildren();
              el.style["pointerEvents"] = null;
              el.style["display"] = "none";
            }
          }
        }
      }
    }
  }
};
