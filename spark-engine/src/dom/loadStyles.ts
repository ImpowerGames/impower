import { getRootElementId } from "./ids/getRootElementId";
import { getStyleElementId } from "./ids/getStyleElementId";
import { getCSSPropertyKeyValue } from "./utils/getCSSPropertyKeyValue";
import { getElement } from "./utils/getElement";

export const loadStyles = (
  objectMap: Record<string, Record<string, unknown>>,
  ...styleStructNames: string[]
): void => {
  const rootElementId = getRootElementId();
  const styleElementId = getStyleElementId();
  const rootEl = getElement(rootElementId);
  if (!rootEl) {
    return;
  }
  const styleEl = getElement(styleElementId) || document.createElement("style");
  if (styleEl.id !== styleElementId) {
    styleEl.id = styleElementId;
  }
  if (styleEl.parentElement !== rootEl) {
    rootEl.appendChild(styleEl);
  }
  if (!objectMap) {
    return;
  }
  const imports = Object.values(objectMap?.["import"] || {});
  let content = "";
  content += `${imports.map((x) => `\n@import url("${x}");`)}`;
  styleStructNames.forEach((k) => {
    if (content) {
      content += "\n";
    }
    const styleStruct = objectMap[k];
    const breakpointMap: Record<string, string[]> = {};
    Object.entries(styleStruct || {}).forEach(([fk, fv]) => {
      if (fk.includes(".")) {
        const [breakpoint, propName] = fk.split(".");
        if (breakpoint && propName) {
          if (!breakpointMap[breakpoint]) {
            breakpointMap[breakpoint] = [];
          }
          const [cssProp, cssValue] = getCSSPropertyKeyValue(propName, fv);
          breakpointMap[breakpoint]?.push(`${cssProp}: ${cssValue};`);
        }
      } else {
        if (!breakpointMap[""]) {
          breakpointMap[""] = [];
        }
        const [cssProp, cssValue] = getCSSPropertyKeyValue(fk, fv);
        breakpointMap[""].push(`${cssProp}: ${cssValue};`);
      }
    });
    Object.entries(breakpointMap || {}).forEach(([breakpoint, fields]) => {
      const fieldsContent = `{\n${fields.join(`\n  `)}\n}`;
      if (content) {
        content += "\n";
      }
      if (breakpoint) {
        content += `.${breakpoint} #${rootElementId} .${k} ${fieldsContent}`;
      } else {
        content += `#${rootElementId} .${k} ${fieldsContent}`;
      }
    });
  });
  if (styleEl.textContent !== content) {
    styleEl.textContent = content;
  }
};
