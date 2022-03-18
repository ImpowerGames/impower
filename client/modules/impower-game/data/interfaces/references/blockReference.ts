import { ContainerReference } from "./containerReference";

export interface BlockReference extends ContainerReference<"Block"> {
  parentContainerType: "Block";
  refType: "Block";
  refTypeId: "Block";
}
