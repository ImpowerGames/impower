import { BlockReference } from "../interfaces/references/blockReference";

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
