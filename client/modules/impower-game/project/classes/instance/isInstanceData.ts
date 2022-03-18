import { DataType, Reference } from "../../../data";
import { InstanceData } from "./instanceData";

export const isInstanceData = <
  D extends DataType = DataType,
  R extends Reference<D> = Reference<D>
>(
  obj: unknown
): obj is InstanceData<D, R> => {
  if (!obj) {
    return false;
  }
  const instanceData = obj as InstanceData<D, R>;
  return instanceData.reference !== undefined;
};
