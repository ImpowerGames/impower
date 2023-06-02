import isList from "./isList";

const validatePropertyPath = <T>(propertyPath: string, defaultData: T): T => {
  const properties = propertyPath.split(".");
  const propertyValues: unknown[] = [];
  let currentObj: unknown = defaultData;
  let index = 0;
  properties.forEach((p) => {
    const record = currentObj as Record<string | number | symbol, unknown>;
    const newObj = record[p];
    propertyValues.push(newObj);
    if (newObj !== undefined) {
      currentObj = newObj;
    } else {
      const grandParentValue = propertyValues[index - 2];
      if (isList(grandParentValue)) {
        record[p] = grandParentValue.default;
      }
    }
    index += 1;
  });
  return defaultData;
};

export default validatePropertyPath;
