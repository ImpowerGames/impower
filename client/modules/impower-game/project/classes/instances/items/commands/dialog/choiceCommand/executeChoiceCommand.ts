import { format } from "../../../../../../../../impower-evaluate";
import { ChoiceCommandData } from "../../../../../../../data";
import {
  getElements,
  getUIElementId,
  loadStyles,
  loadUI,
} from "../../../../../../../dom";
import { ChoiceCommandConfig } from "./choiceCommandConfig";

export const defaultChoiceCommandConfig: ChoiceCommandConfig = {
  choice: {
    id: "Choice",
  },
};

export const executeChoiceCommand = (
  data?: ChoiceCommandData,
  context?: {
    valueMap: Record<string, unknown>;
    objectMap: Record<string, Record<string, unknown>>;
  },
  index?: number,
  count?: number,
  onClick?: () => void
): void => {
  const ui = getUIElementId();
  const content = data?.content || "";
  const order = data?.order || 0;

  const valueMap = context?.valueMap;
  const config =
    (context?.objectMap?.ChoiceCommand as ChoiceCommandConfig) ||
    defaultChoiceCommandConfig;

  loadStyles(
    context?.objectMap,
    ...Object.keys(context?.objectMap?.style || {})
  );
  loadUI(context?.objectMap, "Display");

  const validIndex = index != null ? index : order;
  const contentEls = getElements(ui, config?.choice?.id);
  const [replaceTagsResult] = format(content, valueMap);
  const [evaluatedContent] = format(replaceTagsResult, valueMap);
  const handleClick = (e: MouseEvent): void => {
    e.stopPropagation();
    contentEls.forEach((el) => {
      if (el) {
        el.replaceChildren("");
        el.style.display = "none";
      }
    });
    onClick?.();
  };
  if (!data) {
    contentEls.forEach((el) => {
      if (el) {
        el.replaceChildren("");
        el.style.display = "none";
      }
    });
    return;
  }
  const lastContentEl = contentEls?.[contentEls.length - 1];
  const parentEl = lastContentEl?.parentElement;
  for (let i = 0; i < Math.max(contentEls.length, validIndex + 1); i += 1) {
    const el =
      contentEls?.[i] ||
      parentEl.appendChild(lastContentEl?.cloneNode(true) as HTMLElement);
    if (el) {
      if (validIndex === i) {
        el.onclick = handleClick;
        el.replaceChildren(evaluatedContent);
        el.style.display = "block";
      }
      if (count != null) {
        if (i >= count) {
          el.replaceChildren("");
          el.style.display = "none";
        }
      }
    }
  }
};
