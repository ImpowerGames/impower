import { Identifier } from "./Identifier";

export interface IIdentifiable {
  identifier: Identifier;
}

export const isIdentifiable = (obj: unknown): obj is IIdentifiable => {
  const castObj = obj as IIdentifiable;
  if (!castObj) {
    return false;
  }
  return castObj.identifier !== undefined;
};
