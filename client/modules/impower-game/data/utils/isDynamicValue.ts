import { DynamicValue } from "../interfaces/dynamicValue";

export const isDynamicValue = (obj: unknown): obj is DynamicValue => {
  const cast = obj as DynamicValue;
  if (cast == null) {
    return false;
  }
  return cast.name !== undefined;
};
