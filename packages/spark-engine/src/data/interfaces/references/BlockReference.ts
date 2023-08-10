import { ContainerReference } from "./ContainerReference";

export interface BlockReference extends ContainerReference<"Block"> {
  type: "Block";
  typeId: "Block";
}
