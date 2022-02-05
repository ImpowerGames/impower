import { Container } from "../../impower-script-engine";

export interface IContentList {
  dontFlatten: boolean;
  runtimeContainer: Container;
}

export const isContentList = (obj: unknown): obj is IContentList => {
  const castObj = obj as IContentList;
  if (typeof castObj !== "object") {
    return false;
  }
  return (
    castObj.dontFlatten !== undefined && castObj.runtimeContainer !== undefined
  );
};
