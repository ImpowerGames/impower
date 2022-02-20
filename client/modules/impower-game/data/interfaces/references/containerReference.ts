import { ContainerType } from "../../enums/data";
import { isReference, Reference } from "../reference";

export interface ContainerReference<D extends ContainerType = ContainerType>
  extends Reference<D> {
  parentContainerType: D;
  parentContainerId: string;
  refType: D;
}

export const isContainerReference = <D extends ContainerType = ContainerType>(
  obj: unknown
): obj is ContainerReference<D> => {
  if (!obj) {
    return false;
  }
  const containerReference = obj as ContainerReference<D>;
  return (
    isReference(obj) &&
    (containerReference.parentContainerType === "Construct" ||
      containerReference.parentContainerType === "Block") &&
    containerReference.parentContainerId !== undefined &&
    (containerReference.refType === "Construct" ||
      containerReference.refType === "Block")
  );
};
