export interface INamedContent {
  name: string;
  hasValidName: boolean;
}

export const isNamedContent = (obj: unknown): obj is INamedContent => {
  const item = obj as INamedContent;
  if (typeof item !== "object") {
    return false;
  }
  if (item.name === undefined || item.hasValidName === undefined) {
    return false;
  }
  if (typeof item.name !== "string" && typeof item.hasValidName !== "boolean") {
    return false;
  }

  return true;
};
