import { ItemType } from "../../enums/Data";
import { Reference } from "../Reference";

export interface ItemReference<D extends ItemType = ItemType>
  extends Reference<D> {
  parentId: string;
  type: D;
}
