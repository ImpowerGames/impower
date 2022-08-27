import { getRootElementId } from "./ids/getRootElementId";
import { getStyleElementId } from "./ids/getStyleElementId";
import { getCSSPropertyKeyValue } from "./utils/getCSSPropertyKeyValue";
import { getElement } from "./utils/getElement";

export const loadStyles = (
  objectMap: Record<string, Record<string, unknown>>,
  ...styleEntityNames: string[]
): HTMLStyleElement => {
  const rootElementId = getRootElementId();
  const styleElementId = getStyleElementId();
  const rootEl = getElement(rootElementId);
  if (!rootEl) {
    return null;
  }
  const imports = Object.values(objectMap?.import || {});
  let content = `${imports.map((x) => `\n@import url("${x}");`)}`;
  styleEntityNames.forEach((k) => {
    const styleEntity = objectMap[k];
    let c = "";
    Object.entries(styleEntity).forEach(([fk, fv]) => {
      if (c) {
        c += "\n";
      }
      if (typeof fv === "object") {
        // TODO
      } else {
        const [cssProp, cssValue] = getCSSPropertyKeyValue(fk, fv);
        c += `  ${cssProp}: ${cssValue};`;
      }
    });
    if (content) {
      content += "\n";
    }
    content += `#${rootElementId} .${k} {\n${c}\n}`;
  });
  const styleEl =
    (getElement(styleElementId) as HTMLStyleElement) ||
    document.createElement("style");
  if (styleEl.id !== styleElementId) {
    styleEl.id = styleElementId;
  }
  if (styleEl.textContent !== content) {
    styleEl.textContent = content;
  }
  if (styleEl.parentElement !== rootEl) {
    rootEl.appendChild(styleEl);
  }
  return styleEl;
};
