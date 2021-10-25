import { ContainerType, DataType } from "../enums/data";

export interface Reference<D extends DataType = DataType> {
  refId: string;
  refTypeId: string;
  refType: D;
  parentContainerId?: string;
  parentContainerType?: ContainerType;
}

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
