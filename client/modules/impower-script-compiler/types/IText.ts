export interface IText {
  text: string;
}

export const isText = (obj: unknown): obj is IText => {
  const castObj = obj as IText;
  if (typeof castObj !== "object") {
    return false;
  }
  return castObj.text !== undefined;
};
