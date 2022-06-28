import { SparkParseResult } from "../types/SparkParseResult";
import { getEntityContext } from "./getEntityContext";

export const getGlobalEvaluationContext = (
  result: SparkParseResult
): Record<string, unknown> => {
  const [, entityValues] = getEntityContext(result?.entities);
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
    ...entityValues,
    ...sectionValues,
    ...tagValues,
    ...assetValues,
    ...variableValues,
  };
};
