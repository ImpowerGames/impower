import { SparkEntity } from "../types/SparkEntity";

export const getEntityContext = (
  entities: Record<string, SparkEntity>
): [Record<string, string>, Record<string, unknown>] => {
  const entityNames: Record<string, string> = Object.keys(
    entities || {}
  ).reduce((p, c) => {
    p[c] = c;
    return p;
  }, {});
  const entityValues: Record<string, unknown> = {};
  const definedFields = new Set<string>();
  Object.values(entities || {}).forEach((e) => {
    let curr = e;
    while (curr) {
      const name = curr?.name;
      Object.entries(curr.fields || {}).forEach(([k, v]) => {
        if (!definedFields.has(k)) {
          definedFields.add(k);
          const id = name + k;
          entityValues[id] = v.value;
        }
      });
      curr = entities?.[curr.base];
    }
  });
  return [entityNames, entityValues];
};
