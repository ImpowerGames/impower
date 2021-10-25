const getPropertyName = (propertyPath: string): string => {
  const lastPropertyIndex = propertyPath.lastIndexOf(".");
  if (lastPropertyIndex > -1) {
    return propertyPath.substring(lastPropertyIndex + 1);
  }
  return propertyPath;
};

export default getPropertyName;
