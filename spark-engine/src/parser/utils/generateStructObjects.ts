import { isSparkReference, SparkStruct } from "../../../../sparkdown";

export const generateStructObject = (
  structKey: string,
  structValue: SparkStruct,
  structs: Record<string, SparkStruct>,
  objects: { [type: string]: Record<string, object> }
): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  if (!objects[structValue.type]) {
    objects[structValue.type] = {};
  }
  Object.entries(structValue?.fields || {}).forEach(([fk, fv]) => {
    const val = fv.value;
    if (typeof val === "object" && isSparkReference(val)) {
      const struct = structs[val.name];
      if (struct) {
        const structValues = generateStructObject(
          val.name,
          struct,
          structs,
          objects
        );
        Object.entries(structValues).forEach(([rk, rv]) => {
          values[`${fk}.${rk}`] = rv;
        });
      }
    } else {
      values[fk] = val;
    }
  });
  let base = structValue?.base;
  while (base) {
    const baseStruct = structs[base];
    Object.entries(baseStruct?.fields || {}).forEach(([fk, fv]) => {
      if (values[fk] === undefined) {
        const val = fv.value;
        if (typeof val === "object" && isSparkReference(val)) {
          const struct = structs[val.name];
          if (struct) {
            const structValues = generateStructObject(
              val.name,
              struct,
              structs,
              objects
            );
            Object.entries(structValues).forEach(([rk, rv]) => {
              values[`${fk}.${rk}`] = rv;
            });
          }
        } else {
          values[fk] = val;
        }
      }
    });
    base = baseStruct?.base || "";
  }
  const typeObj = objects[structValue.type];
  if (typeObj) {
    typeObj[structKey] = values;
  }
  return values;
};

export const generateStructObjects = (
  structs: Record<string, SparkStruct>
): { [type: string]: Record<string, object> } => {
  const objects: { [type: string]: Record<string, object> } = {};
  Object.entries(structs || {}).forEach(([structKey, structValue]) => {
    generateStructObject(structKey, structValue, structs, objects);
  });
  return objects;
};
