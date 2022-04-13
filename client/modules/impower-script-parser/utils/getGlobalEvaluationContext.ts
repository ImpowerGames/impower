import { SparkParseResult } from "../types/SparkParseResult";

export const getGlobalEvaluationContext = (
  result: SparkParseResult
): Record<string, unknown> => {
  const entityValues: Record<string, unknown> = {};
  Object.values(result?.entities || {}).forEach((e) => {
    let curr = e;
    while (curr) {
      const name = curr?.name;
      Object.entries(curr.fields).forEach(([k, v]) => {
        const id = name + k;
        if (entityValues[id] === undefined) {
          entityValues[id] = v.value;
        }
      });
      curr = result?.entities?.[curr.base];
    }
  });
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
