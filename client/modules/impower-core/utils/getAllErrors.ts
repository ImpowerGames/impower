import getValue from "./getValue";

const getAllErrors = async <T>(
  propertyPaths: string[],
  data: T,
  getPropertyError: (
    propertyPath: string,
    data: T,
    value: unknown,
    docIds: string[]
  ) => Promise<string>,
  getPropertyDocIds?: (propertyPath: string, data: T) => string[]
): Promise<{ [propertyPath: string]: string }> => {
  const paths = propertyPaths;
  const promises: Promise<{
    propertyPath: string;
    error: string;
  }>[] = paths.map((propertyPath) =>
    getPropertyError(
      propertyPath,
      data,
      getValue(data, propertyPath),
      getPropertyDocIds?.(propertyPath, data) || []
    ).then((error) => ({ propertyPath, error }))
  );
  const results = await Promise.all(promises);
  const errors: { [propertyPath: string]: string } = {};
  results.forEach((result) => {
    if (result.error) {
      errors[result.propertyPath] = result.error;
    }
  });
  if (errors) {
    return errors;
  }
  return null;
};

export default getAllErrors;
