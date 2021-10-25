import getValue from "./getValue";

const getFirstError = async <T>(
  propertyPaths: string[],
  data: T,
  getPropertyError: (
    propertyPath: string,
    data: T,
    value: unknown,
    docIds: string[]
  ) => Promise<string>,
  getPropertyDocIds: (propertyPath: string, data: T) => string[]
): Promise<string | null> => {
  const paths = propertyPaths;
  const promises: Promise<string | null>[] = paths.map((propertyPath) => {
    return getPropertyError(
      propertyPath,
      data,
      getValue(data, propertyPath),
      getPropertyDocIds(propertyPath, data)
    );
  });
  const errors = await Promise.all(promises);
  const erroredProperty = errors.find((error) => error !== null);
  if (erroredProperty) {
    return erroredProperty;
  }
  return null;
};

export default getFirstError;
