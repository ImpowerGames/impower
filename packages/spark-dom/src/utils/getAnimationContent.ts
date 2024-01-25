import { getCSSPropertyKeyValue } from "./getCSSPropertyKeyValue";

export const getAnimationContent = (
  animationName: string,
  properties: Record<string, any>
): string => {
  const groupMap: Record<string, Record<string, unknown>> = {};
  Object.entries(properties).forEach(([fk, fv]) => {
    const [, keyframe, propName] = fk.split(".");
    if (keyframe && propName && !propName.startsWith("$")) {
      if (!groupMap[keyframe]) {
        groupMap[keyframe] = {};
      }
      const m = groupMap[keyframe];
      if (m) {
        m[propName] = fv;
      }
    }
  });
  let textContent = "";
  textContent += `@keyframes ${animationName} {\n`;
  Object.entries(groupMap || {}).forEach(([keyframe, fields]) => {
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
    const fieldsContent = `{\n    ${content}\n  }`;
    textContent += `  ${keyframe} ${fieldsContent}\n`;
  });
  textContent += `}`;
  textContent = textContent.trim();
  return textContent;
};
