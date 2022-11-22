import { IElement } from "../types/IElement";

export const setupDefaultStyle = (el: IElement): void => {
  el.style["position"] = "absolute";
  el.style["top"] = "0";
  el.style["bottom"] = "0";
  el.style["left"] = "0";
  el.style["right"] = "0";
  el.style["display"] = "flex";
  el.style["flexDirection"] = "column";
};
