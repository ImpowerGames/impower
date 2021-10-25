import { ContainerType } from "../../enums/data";
import { ContainerReference, isContainerReference } from "./containerReference";

export interface BlockReference
  extends ContainerReference<ContainerType.Block> {
  parentContainerType: ContainerType.Block;
  refType: ContainerType.Block;
  refTypeId: ContainerType.Block;
}

export const isBlockReference = (obj: unknown): obj is ContainerReference => {
  if (!obj) {
    return false;
  }
  const blockReference = obj as BlockReference;
  return (
    isContainerReference(obj) &&
    blockReference.parentContainerType === ContainerType.Block &&
    blockReference.refType === ContainerType.Block &&
    blockReference.refTypeId === ContainerType.Block
  );
};

export const createBlockReference = (
  obj?: Partial<BlockReference>
): BlockReference => ({
  parentContainerType: ContainerType.Block,
  parentContainerId: "",
  refType: ContainerType.Block,
  refTypeId: ContainerType.Block,
  refId: "",
  ...obj,
});
