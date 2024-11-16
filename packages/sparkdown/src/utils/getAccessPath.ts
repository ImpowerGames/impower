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
    pathParts.push(declaration.property);
  }
  return pathParts.join(".");
};
