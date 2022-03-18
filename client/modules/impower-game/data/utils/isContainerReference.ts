import { ContainerType } from "../enums/data";
import { ContainerReference } from "../interfaces/references/containerReference";
import { isReference } from "./isReference";

export const isContainerReference = <D extends ContainerType = ContainerType>(
  obj: unknown
): obj is ContainerReference<D> => {
  if (!obj) {
    return false;
  }
  const containerReference = obj as ContainerReference<D>;
  return (
    isReference(obj) &&
    containerReference.parentContainerType === "Block" &&
    containerReference.parentContainerId !== undefined &&
    containerReference.refType === "Block"
  );
};
