import { ContainerType, ItemType } from "../../enums/data";
import { Reference } from "../reference";

export interface ItemReference<D extends ItemType = ItemType>
  extends Reference<D> {
  parentContainerType: ContainerType;
  parentContainerId: string;
  refType: D;
}
