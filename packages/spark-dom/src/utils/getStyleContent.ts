import { getCSSPropertyKeyValue } from "./getCSSPropertyKeyValue";
import { getCSSPropertyName } from "./getCSSPropertyName";

const ALPHA_REGEX = /^[a-zA-Z]/;

export const getStyleContent = (properties: Record<string, any>): string => {
  const target = properties[".target"] as string;
  const groupMap: Record<string, Record<string, unknown>> = {};
  Object.entries(properties).forEach(([fk, fv]) => {
    const fieldPath = fk.split(".");
    const propName = fieldPath[2] || fieldPath[1];
    if (propName && propName !== "target" && !propName.startsWith("$")) {
      const group = fieldPath[2] ? fieldPath[1] : undefined;
      if (propName) {
        if (group) {
          if (!groupMap[group]) {
            groupMap[group] = {};
          }
          const m = groupMap[group];
          if (m) {
            m[propName] = fv;
          }
        } else {
          if (!groupMap[""]) {
            groupMap[""] = {};
          }
          const m = groupMap[""];
          if (m) {
            m[propName] = fv;
          }
        }
      }
    }
  });
  let textContent = "";
  Object.entries(groupMap || {}).forEach(([groupName, fields]) => {
    const content = Object.entries(fields)
      .map(([k, v]) => {
        const [cssProp, cssValue] = getCSSPropertyKeyValue(k, v);
        if (cssValue) {
          return `\n  ${cssProp}: ${cssValue};`;
        }
        return "";
      })
      .join("")
      .trim();
    const fieldsContent = `{\n  ${content}\n}`;
    const cssPropertyName = getCSSPropertyName(groupName);
    const targetSelector = target.match(ALPHA_REGEX) ? `.${target}` : target;
    if (cssPropertyName.startsWith(":")) {
      textContent += `${targetSelector}${cssPropertyName} ${fieldsContent}\n`;
    } else if (groupName.startsWith("*")) {
      textContent += `${targetSelector} ${groupName} ${fieldsContent}\n`;
    } else if (groupName) {
      textContent += `.${groupName} ${targetSelector} ${fieldsContent}\n`;
    } else {
      textContent += `${targetSelector} ${fieldsContent}\n`;
    }
  });
  textContent = textContent.trim();
  return textContent;
};
