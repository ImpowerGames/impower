import { SparkStruct } from "../../../../sparkdown";

export const generateStructObjects = (
  structs: Record<string, SparkStruct>
): { [type: string]: Record<string, unknown> } => {
  const objects: { [type: string]: Record<string, unknown> } = {};
  Object.entries(structs || {}).forEach(([structKey, structValue]) => {
    const values: Record<string, unknown> = {};
    if (!objects[structValue.type]) {
      objects[structValue.type] = {};
    }
    Object.entries(structValue?.fields || {}).forEach(([fk, fv]) => {
      values[fk] = fv.value;
    });
    let base = structValue?.base;
    while (base) {
      const baseStruct = structs[base];
      Object.entries(baseStruct?.fields || {}).forEach(([fk, fv]) => {
        if (values[fk] === undefined) {
          values[fk] = fv.value;
        }
      });
      base = baseStruct?.base || "";
    }
    const typeObj = objects[structValue.type];
    if (typeObj) {
      typeObj[structKey] = values;
    }
  });
  return objects;
};
