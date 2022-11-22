import { SparkGame } from "../../SparkGame";
import { IElement } from "../types/IElement";
import { getHash } from "./getHash";

const setupDefaultStyle = (el: IElement): void => {
  el.style["position"] = "absolute";
  el.style["top"] = "0";
  el.style["bottom"] = "0";
  el.style["left"] = "0";
  el.style["right"] = "0";
  el.style["display"] = "flex";
  el.style["flexDirection"] = "column";
};

export const loadUI = (
  game: SparkGame,
  objectMap: Record<string, Record<string, unknown>>,
  ...uiStructNames: string[]
): void => {
  const uiEl = game.ui.getOrCreateUIRoot();
  uiEl.style["fontFamily"] = "Courier Prime Sans";
  uiEl.style["fontSize"] = "1em";
  setupDefaultStyle(uiEl);
  if (!objectMap) {
    return;
  }
  uiStructNames.forEach((structName) => {
    const fields = objectMap[structName];
    const hash = getHash(fields).toString();
    const existingStructEl = game.ui.getUIElement(structName);
    if (existingStructEl && existingStructEl.dataset["hash"] !== hash) {
      existingStructEl.replaceChildren();
    }
    const structEl =
      existingStructEl || game.ui.constructUIElement("div", structName);
    if (structEl.dataset["hash"] !== hash) {
      structEl.dataset["hash"] = hash;
    }
    setupDefaultStyle(structEl);
    if (fields) {
      Object.entries(fields).forEach(([k, v]) => {
        const curr =
          game.ui.getUIElement(structName, ...k.split(".")) ||
          game.ui.constructUIElement("div", structName, ...k.split("."));
        if (curr && v && typeof v === "string") {
          curr.textContent = v;
        }
      });
    }
  });
};
