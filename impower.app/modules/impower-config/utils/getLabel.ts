import { capitalize } from "./capitalize";
import { splitCamelCaseString } from "./splitCamelCaseString";

export const getLabel = (propertyName: string): string => {
  if (!propertyName || typeof propertyName !== "string") {
    return propertyName?.toString();
  }
  let displayName = propertyName;
  displayName = displayName.replace(/_/g, " ");
  displayName = splitCamelCaseString(displayName);
  displayName = capitalize(displayName);
  return displayName;
};
