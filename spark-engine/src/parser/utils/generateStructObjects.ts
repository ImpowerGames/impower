import { SparkStruct } from "../../../../sparkdown";

export const generateStructObjects = (
  entities: Record<string, SparkStruct>
): Record<string, Record<string, unknown>> => {
  const objects: Record<string, Record<string, unknown>> = {};
  Object.entries(entities || {}).forEach(([k, v]) => {
    const values: Record<string, unknown> = {};
    Object.entries(v?.fields || {}).forEach(([fk, fv]) => {
      values[fk] = fv.value;
    });
    let base = v?.base;
    while (base) {
      const baseStruct = entities[base];
      Object.entries(baseStruct?.fields || {}).forEach(([fk, fv]) => {
        if (values[fk] === undefined) {
          values[fk] = fv.value;
        }
      });
      base = baseStruct?.base || "";
    }
    if (!objects[v.type]) {
      objects[v.type] = {};
    }
    const typeObj = objects[v.type];
    if (typeObj) {
      typeObj[k] = "";
    }
    objects[k] = values;
  });
  return objects;
};
