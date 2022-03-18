import { BlockReference } from "../interfaces/references/blockReference";
import { ContainerReference } from "../interfaces/references/containerReference";
import { isContainerReference } from "./isContainerReference";

export const isBlockReference = (obj: unknown): obj is ContainerReference => {
  if (!obj) {
    return false;
  }
  const blockReference = obj as BlockReference;
  return (
    isContainerReference(obj) &&
    blockReference.parentContainerType === "Block" &&
    blockReference.refType === "Block" &&
    blockReference.refTypeId === "Block"
  );
};
