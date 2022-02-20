import { ContainerReference, isContainerReference } from "./containerReference";

export interface BlockReference extends ContainerReference<"Block"> {
  parentContainerType: "Block";
  refType: "Block";
  refTypeId: "Block";
}

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

export const createBlockReference = (
  obj?: Partial<BlockReference>
): BlockReference => ({
  parentContainerType: "Block",
  parentContainerId: "",
  refType: "Block",
  refTypeId: "Block",
  refId: "",
  ...obj,
});
