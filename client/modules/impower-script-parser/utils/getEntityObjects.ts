import { SparkEntity } from "../types/SparkEntity";

export const getEntityObjects = (
  entities: Record<string, SparkEntity>
): Record<string, Record<string, unknown>> => {
  const objects: Record<string, Record<string, unknown>> = {};
  Object.entries(entities || {}).forEach(([k, v]) => {
    const values: Record<string, unknown> = {};
    Object.entries(v?.fields || {}).forEach(([fk, fv]) => {
      values[fk] = fv.value;
    });
    let base = v?.base;
    while (base) {
      const baseEntity = entities[base];
      Object.entries(baseEntity?.fields || {}).forEach(([fk, fv]) => {
        if (values[fk] === undefined) {
          values[fk] = fv.value;
        }
      });
      base = baseEntity?.base;
    }
    if (!objects[v.type]) {
      objects[v.type] = {};
    }
    objects[v.type][k] = "";
    objects[k] = values;
  });
  return objects;
};
