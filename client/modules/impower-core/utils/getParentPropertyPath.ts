const getParentPropertyPath = (propertyPath: string): string => {
  const lastPropertyIndex = propertyPath.lastIndexOf(".");
  if (lastPropertyIndex > -1) {
    return propertyPath.substring(0, lastPropertyIndex);
  }
  return propertyPath;
};

export default getParentPropertyPath;
