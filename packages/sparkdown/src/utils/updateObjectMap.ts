import { SparkStruct } from "../types/SparkStruct";
import { construct } from "./construct";

export const updateObjectMap = (
  objectMap: { [type: string]: Record<string, any> },
  structs?: Record<string, SparkStruct>
): void => {
  if (!structs) {
    return;
  }
  Object.entries(structs || {}).forEach(([structName, structValue]) => {
    const structType = structValue.type;
    if (!objectMap[structType]) {
      objectMap[structType] = {};
    }
    const typeMap = objectMap[structType];
    if (typeMap) {
      const defaultObj = objectMap?.[""] || {};
      typeMap[structName] = construct(defaultObj, structs, structName);
    }
  });
};
