import { getRootElementId } from "./ids/getRootElementId";
import { getUIElementId } from "./ids/getUIElementId";
import { getElement } from "./utils/getElement";
import { getHash } from "./utils/getHash";

const setupDiv = (uiEntityEl: HTMLDivElement): void => {
  uiEntityEl.style.position = "absolute";
  uiEntityEl.style.top = "0";
  uiEntityEl.style.bottom = "0";
  uiEntityEl.style.left = "0";
  uiEntityEl.style.right = "0";
  uiEntityEl.style.display = "flex";
  uiEntityEl.style.flexDirection = "column";
};

export const loadUI = (
  objectMap: Record<string, Record<string, unknown>>,
  ...uiEntityNames: string[]
): HTMLDivElement => {
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
    setupDiv(uiEl);
  }
  uiEntityNames.forEach((name) => {
    const obj = objectMap[name];
    const hash = getHash(obj).toString();
    const existingEntityEl = getElement(uiElementId, name) as HTMLDivElement;
    if (existingEntityEl && existingEntityEl.dataset.hash !== hash) {
      existingEntityEl.innerHTML = "";
    }
    const entityEl = existingEntityEl || document.createElement("div");
    entityEl.className = name;
    if (entityEl.dataset.hash !== hash) {
      entityEl.dataset.hash = hash;
    }
    setupDiv(entityEl);
    if (entityEl.parentElement !== rootEl) {
      uiEl.appendChild(entityEl);
    }
    const entityElMap: Record<string, HTMLElement> = {};
    let childPath = "";
    entityElMap[childPath] = entityEl;
    Object.entries(obj || {}).forEach(([k, v]) => {
      childPath = "";
      k.split(".").forEach((n) => {
        if (n) {
          const parentPath = childPath;
          childPath += ` .${n}`;
          const parentEl = entityElMap[parentPath];
          if (!entityElMap[childPath]) {
            const selector = `#${rootElementId} ${childPath}`;
            let childEl = document.querySelector(selector) as HTMLDivElement;
            if (!childEl) {
              childEl = document.createElement("div");
              childEl.className = n;
              parentEl.appendChild(childEl);
            }
            entityElMap[childPath] = childEl;
          }
        }
      });
      if (v && typeof v === "string") {
        entityElMap[childPath].textContent = v;
      }
    });
  });
  if (uiEl.parentElement !== rootEl) {
    rootEl.appendChild(uiEl);
  }
  return uiEl;
};
