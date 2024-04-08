import extractSVG from "./extractSVG.js";

const VARIABLE_REGEX = /(--(?:.|\n)+[)][;])/g;

const extractAllSVGs = (
  prefix: string,
  css: string
): Record<string, string> => {
  const result: Record<string, string> = {};
  if (css) {
    const matches = css.match(VARIABLE_REGEX);
    matches?.forEach((match) => {
      const separatorIndex = match.indexOf(":");
      const key = match.substring(0, separatorIndex);
      const value = match.substring(separatorIndex + 1);
      if (key && value && key.startsWith(prefix)) {
        const name = key.replace(prefix, "").trim();
        result[name] = extractSVG(value);
      }
    });
  }
  return result;
};

export default extractAllSVGs;
