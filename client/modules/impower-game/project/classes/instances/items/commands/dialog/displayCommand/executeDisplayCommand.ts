import { format } from "../../../../../../../../impower-evaluate";
import { DisplayCommandData, DisplayType } from "../../../../../../../data";

export const executeDisplayCommand = (
  data: DisplayCommandData,
  context: {
    valueMap: Record<string, unknown>;
  }
): void => {
  const { valueMap } = context;
  const ui = data.ui || "impower-ui";
  const dialogueGroupEl: HTMLElement = document.querySelector(
    `#${ui} .dialogue-group`
  );
  const characterEl: HTMLElement = document.querySelector(`#${ui} .character`);
  const portraitEl: HTMLElement = document.querySelector(`#${ui} .portrait`);
  const parentheticalEl: HTMLElement = document.querySelector(
    `#${ui} .parenthetical`
  );
  const contentElEntries: [DisplayType, HTMLElement][] = Object.values(
    DisplayType
  ).map((x) => [x, document.querySelector(`#${ui} .${x}`)]);
  const character = data.type === DisplayType.Dialogue ? data.character : "";
  const assets = data.type === DisplayType.Dialogue ? data.assets : [];
  const parenthetical =
    data.type === DisplayType.Dialogue ? data.parenthetical : "";
  const content = data?.content
    .replace(/(?:\[{2}(?!\[+))([\s\S]+?)(?:\]{2}(?!\[+)) ?/g, "") // Replace [[image]]
    .replace(/(?:\({2}(?!\(+))([\s\S]+?)(?:\){2}(?!\(+)) ?/g, ""); // Replace ((audio))
  const [replaceTagsResult] = format(content, valueMap);
  const [evaluatedContent] = format(replaceTagsResult, valueMap);
  if (dialogueGroupEl) {
    dialogueGroupEl.style.display = data?.type === "dialogue" ? null : "none";
  }
  if (characterEl) {
    characterEl.replaceChildren(character);
    characterEl.style.display = character ? null : "none";
  }
  if (portraitEl) {
    const portraitName = assets?.[0];
    portraitEl.style.backgroundImage = `url("${valueMap[portraitName]}")`;
    portraitEl.style.backgroundRepeat = "no-repeat";
    portraitEl.style.backgroundPosition = "center";
    portraitEl.style.display = assets ? null : "none";
  }
  if (parentheticalEl) {
    parentheticalEl.replaceChildren(parenthetical);
    parentheticalEl.style.display = parenthetical ? null : "none";
  }
  contentElEntries.forEach(([type, el]) => {
    if (el) {
      el.replaceChildren(type === data?.type ? evaluatedContent : "");
      el.style.display = type === data?.type ? null : "none";
    }
  });
  const contentEls = document.querySelectorAll<HTMLButtonElement>(
    `#${ui} .choice`
  );
  contentEls.forEach((el) => {
    if (el) {
      el.replaceChildren("");
      el.style.display = "none";
    }
  });
};
