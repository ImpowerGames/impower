import { SparkProgram } from "../types/SparkProgram";

const getGlobalValueContext = (
  program: SparkProgram
): Record<string, unknown> => {
  const sectionValues: Record<string, number> = {};
  Object.keys(program?.sections || {}).forEach((id) => {
    sectionValues[id] = 0;
  });
  const variableValues: Record<string, unknown> = {};
  Object.entries(program?.variables || {}).forEach(([id, v]) => {
    variableValues[id] = v.value;
  });
  return {
    ...sectionValues,
    ...variableValues,
  };
};

export default getGlobalValueContext;
