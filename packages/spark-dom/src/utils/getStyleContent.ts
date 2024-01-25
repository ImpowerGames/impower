import { getCSSPropertyKeyValue } from "./getCSSPropertyKeyValue";
import { getCSSPropertyName } from "./getCSSPropertyName";

export const getStyleContent = (
  targetName: string,
  properties: Record<string, any>,
  breakpoints: Record<string, number>
): string => {
  const target = (properties[".target"] as string) || `.${targetName}`;
  const selector = target.replaceAll("$", targetName);
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
    const isBreakpointGroup = groupName && breakpoints[groupName];
    if (isBreakpointGroup) {
      textContent += `.${groupName} ${selector} ${fieldsContent}\n`;
    } else if (groupName.startsWith("*")) {
      textContent += `${selector} ${groupName} ${fieldsContent}\n`;
    } else if (groupName) {
      const cssPseudoName = getCSSPropertyName(groupName);
      textContent += `${selector}:${cssPseudoName} ${fieldsContent}\n`;
    } else {
      textContent += `${selector} ${fieldsContent}\n`;
    }
  });
  textContent = textContent.trim();
  return textContent;
};
