import { format } from "../../../../../../../../impower-evaluate";
import { ChoiceCommandData } from "../../../../../../../data";

export const executeChoiceCommand = (
  data?: ChoiceCommandData,
  context?: {
    valueMap: Record<string, unknown>;
  },
  index?: number,
  count?: number,
  onClick?: () => void
): void => {
  const content = data?.content || "";
  const valueMap = context?.valueMap;
  const ui = "impower_ui";
  const contentEls = document.querySelectorAll<HTMLButtonElement>(
    `#${ui} .choice`
  );
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
  contentEls.forEach((el, i) => {
    if (el) {
      if (i === index) {
        el.onclick = handleClick;
        el.replaceChildren(evaluatedContent);
        el.style.display = "block";
      }
      if (i >= count) {
        el.replaceChildren("");
        el.style.display = "none";
      }
    }
  });
};
