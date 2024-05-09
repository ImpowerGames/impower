import type { SparkVariable } from "../types/SparkVariable";
import buildSVGSource from "./buildSVGSource";

const processAssetVariable = (variable: SparkVariable) => {
  if (
    variable.type === "image" &&
    variable.compiled.ext === "svg" &&
    variable.compiled.text
  ) {
    const text = variable.compiled.text;
    if (typeof text === "string") {
      variable.compiled.src = buildSVGSource(text, {
        includes: ["default"],
      });
    }
  }
};

export default processAssetVariable;
