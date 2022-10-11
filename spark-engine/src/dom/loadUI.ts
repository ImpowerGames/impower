import { getRootElementId } from "./ids/getRootElementId";
import { getUIElementId } from "./ids/getUIElementId";
import { getElement } from "./utils/getElement";
import { getHash } from "./utils/getHash";

const setupDiv = (uiStructEl: HTMLDivElement): void => {
  uiStructEl.style.position = "absolute";
  uiStructEl.style.top = "0";
  uiStructEl.style.bottom = "0";
  uiStructEl.style.left = "0";
  uiStructEl.style.right = "0";
  uiStructEl.style.display = "flex";
  uiStructEl.style.flexDirection = "column";
};

export const loadUI = (
  objectMap: Record<string, Record<string, unknown>>,
  ...uiStructNames: string[]
): HTMLDivElement | null => {
  const rootElementId = getRootElementId();
  const uiElementId = getUIElementId();
  const rootEl = getElement(rootElementId);
  if (!rootEl) {
    return null;
  }
  const uiEl =
    (getElement(uiElementId) as HTMLDivElement) ||
    document.createElement("div");
  if (uiEl.className !== uiElementId) {
    uiEl.id = uiElementId;
    uiEl.style.fontFamily = "Courier Prime Sans";
    uiEl.style.fontSize = "1em";
    setupDiv(uiEl);
  }
  if (uiEl.parentElement !== rootEl) {
    rootEl.appendChild(uiEl);
  }
  if (!objectMap) {
    return null;
  }
  uiStructNames.forEach((name) => {
    const obj = objectMap[name];
    const hash = getHash(obj).toString();
    const existingStructEl = getElement(uiElementId, name) as HTMLDivElement;
    if (existingStructEl && existingStructEl.dataset.hash !== hash) {
      existingStructEl.innerHTML = "";
    }
    const structEl = existingStructEl || document.createElement("div");
    structEl.className = name;
    if (structEl.dataset.hash !== hash) {
      structEl.dataset.hash = hash;
    }
    setupDiv(structEl);
    if (structEl.parentElement !== rootEl) {
      uiEl.appendChild(structEl);
    }
    const structElMap: Record<string, HTMLElement> = {};
    let childPath = "";
    structElMap[childPath] = structEl;
    Object.entries(obj || {}).forEach(([k, v]) => {
      childPath = "";
      k.split(".").forEach((n) => {
        if (n) {
          const parentPath = childPath;
          childPath += ` .${n}`;
          const parentEl = structElMap[parentPath];
          if (!structElMap[childPath]) {
            const selector = `#${rootElementId} ${childPath}`;
            let childEl = document.querySelector(selector) as HTMLDivElement;
            if (!childEl) {
              childEl = document.createElement("div");
              childEl.className = n;
              parentEl.appendChild(childEl);
            }
            structElMap[childPath] = childEl;
          }
        }
      });
      if (v && typeof v === "string") {
        structElMap[childPath].textContent = v;
      }
    });
  });
  return uiEl;
};
