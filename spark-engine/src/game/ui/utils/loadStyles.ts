import { SparkGame } from "../../SparkGame";
import { getCSSPropertyKeyValue } from "./getCSSPropertyKeyValue";

export const loadStyles = (
  game: SparkGame,
  objectMap: Record<string, Record<string, unknown>>,
  ...styleStructNames: string[]
): void => {
  const styleEl = game.ui.getOrCreateStyleRoot();
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
        content += `.${breakpoint} #${game.ui.config.root.id} .${k} ${fieldsContent}`;
      } else {
        content += `#${game.ui.config.root.id} .${k} ${fieldsContent}`;
      }
    });
  });
  if (styleEl.textContent !== content) {
    styleEl.textContent = content;
  }
};
