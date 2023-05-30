import { ContainerType, ItemType } from "../../enums/Data";
import { Reference } from "../Reference";

export interface ItemReference<D extends ItemType = ItemType>
  extends Reference<D> {
  parentContainerType: ContainerType;
  parentContainerId: string;
  refType: D;
}
