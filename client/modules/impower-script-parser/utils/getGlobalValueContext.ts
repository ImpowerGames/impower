import { SparkParseResult } from "../types/SparkParseResult";

export const getGlobalValueContext = (
  result: SparkParseResult
): Record<string, unknown> => {
  const sectionValues: Record<string, number> = {};
  Object.keys(result?.sections || {}).forEach((id) => {
    sectionValues[id] = 0;
  });
  const tagValues: Record<string, string> = {};
  Object.entries(result?.tags || {}).forEach(([id, v]) => {
    tagValues[id] = v.value;
  });
  const assetValues: Record<string, string> = {};
  Object.entries(result?.assets || {}).forEach(([id, v]) => {
    assetValues[id] = v.value;
  });
  const variableValues: Record<string, unknown> = {};
  Object.entries(result?.variables || {}).forEach(([id, v]) => {
    variableValues[id] = v.value;
  });
  return {
    ...sectionValues,
    ...tagValues,
    ...assetValues,
    ...variableValues,
  };
};
