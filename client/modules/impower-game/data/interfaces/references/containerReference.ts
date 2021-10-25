import { isReference, Reference } from "../reference";
import { ContainerType } from "../../enums/data";

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
    (containerReference.parentContainerType === ContainerType.Construct ||
      containerReference.parentContainerType === ContainerType.Block) &&
    containerReference.parentContainerId !== undefined &&
    (containerReference.refType === ContainerType.Construct ||
      containerReference.refType === ContainerType.Block)
  );
};
