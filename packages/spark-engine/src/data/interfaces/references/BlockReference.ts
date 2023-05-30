import { ContainerReference } from "./ContainerReference";

export interface BlockReference extends ContainerReference<"Block"> {
  parentContainerType: "Block";
  refType: "Block";
  refTypeId: "Block";
}
