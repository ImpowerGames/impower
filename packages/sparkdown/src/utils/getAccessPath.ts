import { SparkDeclaration } from "../types/SparkDeclaration";

export const getAccessPath = (declaration: SparkDeclaration) => {
  const nameParts: string[] = [];
  if (declaration.modifier) {
    nameParts.push("$" + declaration.modifier);
  }
  if (declaration.name) {
    nameParts.push(declaration.name);
  }
  const qualifiedName = nameParts.join(":") || "$default";
  const pathParts: string[] = [declaration.type, qualifiedName];
  if (declaration.property) {
    const trimmedPropertyPath = declaration.property.startsWith(".")
      ? declaration.property.slice(1)
      : declaration.property;
    pathParts.push(trimmedPropertyPath);
  }
  return pathParts.join(".");
};
