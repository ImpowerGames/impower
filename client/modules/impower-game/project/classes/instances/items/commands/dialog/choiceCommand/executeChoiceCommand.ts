import { format } from "../../../../../../../../impower-evaluate";
import { ChoiceCommandData } from "../../../../../../../data";

export const executeChoiceCommand = (
  data: ChoiceCommandData,
  context: {
    valueMap: Record<string, unknown>;
  },
  onClick?: () => void
): void => {
  const { valueMap } = context;
  const ui = data.ui || "impower-ui";
  const contentEls = document.querySelectorAll<HTMLButtonElement>(
    `#${ui} .choice`
  );
  const content = data?.content;
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
  contentEls.forEach((el, index) => {
    if (el) {
      if (index === data?.index) {
        el.onclick = handleClick;
        el.replaceChildren(evaluatedContent);
        el.style.display = "block";
      }
      if (index >= data?.count) {
        el.replaceChildren("");
        el.style.display = "none";
      }
    }
  });
};
