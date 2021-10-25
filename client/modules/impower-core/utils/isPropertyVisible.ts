import getParentPropertyPath from "./getParentPropertyPath";
import getPropertyName from "./getPropertyName";
import getValue from "./getValue";
import isCollection from "./isCollection";
import isList from "./isList";
import isOrderedCollection from "./isOrderedCollection";

const isPropertyVisible = <T>(propertyPath: string, data: T): boolean => {
  const propertyName = getPropertyName(propertyPath);
  if (propertyPath.endsWith(".default")) {
    const parentPath = getParentPropertyPath(propertyPath);
    const parentValue = getValue(data, parentPath);
    if (isList(parentValue)) {
      return false;
    }
  }
  if (propertyPath.endsWith(".order")) {
    const parentPath = getParentPropertyPath(propertyPath);
    const parentValue = getValue(data, parentPath);
    if (isOrderedCollection(parentValue)) {
      return false;
    }
  }
  if (propertyPath.endsWith(".limit")) {
    const parentPath = getParentPropertyPath(propertyPath);
    const parentValue = getValue(data, parentPath);
    if (isCollection(parentValue)) {
      return false;
    }
  }
  if (propertyName.startsWith("_")) {
    return false;
  }
  return true;
};

export default isPropertyVisible;
