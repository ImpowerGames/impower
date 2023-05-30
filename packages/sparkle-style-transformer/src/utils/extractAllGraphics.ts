import Graphic from "../types/graphic.js";
import parseGraphic from "../utils/parseGraphic.js";

const VARIABLE_REGEX = /(--(?:.|\n)+[)][;])/g;

const extractAllGraphics = (
  prefix: string,
  css: string
): Record<string, Graphic> => {
  const result: Record<string, Graphic> = {};
  if (css) {
    const matches = css.match(VARIABLE_REGEX);
    matches?.forEach((match) => {
      const separatorIndex = match.indexOf(":");
      const key = match.substring(0, separatorIndex);
      const value = match.substring(separatorIndex + 1);
      if (key && value && key.startsWith(prefix)) {
        const name = key.replace(prefix, "").trim();
        result[name] = parseGraphic(value);
      }
    });
  }
  return result;
};

export default extractAllGraphics;
