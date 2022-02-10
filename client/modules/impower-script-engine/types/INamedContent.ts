export interface INamedContent {
  name: string;
  hasValidName: boolean;
}

export const isNamedContent = (obj: unknown): obj is INamedContent => {
  const castObj = obj as INamedContent;
  if (!castObj) {
    return false;
  }
  if (castObj.name === undefined) {
    return false;
  }

  return true;
};
