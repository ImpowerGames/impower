import { DataType } from "../enums/data";
import { Reference } from "../interfaces/reference";

export const isReference = <D extends DataType>(
  obj: unknown
): obj is Reference<D> => {
  if (!obj) {
    return false;
  }
  const reference = obj as Reference<D>;
  return (
    reference.refId !== undefined &&
    reference.refTypeId !== undefined &&
    reference.refType !== undefined
  );
};
