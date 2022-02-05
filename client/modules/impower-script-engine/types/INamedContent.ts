export interface INamedContent {
  name: string;
  hasValidName: boolean;
}

export const isNamedContent = (obj: unknown): obj is INamedContent => {
  const item = obj as INamedContent;
  if (typeof item !== "object") {
    return false;
  }
  if (item.name === undefined) {
    return false;
  }
  if (typeof item.name !== "string") {
    return false;
  }

  return true;
};
