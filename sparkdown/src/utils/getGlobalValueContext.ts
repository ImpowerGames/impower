import { SparkParseResult } from "../types/SparkParseResult";

export const getGlobalValueContext = (
  result: SparkParseResult
): Record<string, unknown> => {
  const sectionValues: Record<string, number> = {};
  Object.keys(result?.sections || {}).forEach((id) => {
    sectionValues[id] = 0;
  });
  const variableValues: Record<string, unknown> = {};
  Object.entries(result?.variables || {}).forEach(([id, v]) => {
    variableValues[id] = v.value;
  });
  return {
    ...sectionValues,
    ...variableValues,
  };
};
