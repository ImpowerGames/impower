import { Identifier } from "./Identifier";

export interface IIdentifiable {
  identifier: Identifier;
}

export const isIdentifiable = (obj: unknown): obj is IIdentifiable => {
  const castObj = obj as IIdentifiable;
  if (typeof castObj !== "object") {
    return false;
  }
  return castObj.identifier !== undefined;
};
