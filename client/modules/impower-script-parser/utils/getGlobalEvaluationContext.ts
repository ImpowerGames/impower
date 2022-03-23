import { SparkParseResult } from "../types/SparkParseResult";

export const getGlobalEvaluationContext = (
  result: SparkParseResult
): Record<string, string | number | boolean> => {
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
  const entityValues: Record<string, string> = {};
  Object.entries(result?.entities || {}).forEach(([id, v]) => {
    entityValues[id] = v.value;
  });
  const variableValues: Record<string, string | number | boolean> = {};
  Object.entries(result?.variables || {}).forEach(([id, v]) => {
    variableValues[id] = v.value;
  });
  return {
    ...sectionValues,
    ...tagValues,
    ...assetValues,
    ...entityValues,
    ...variableValues,
  };
};
