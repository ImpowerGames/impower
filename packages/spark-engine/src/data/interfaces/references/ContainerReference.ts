import { ContainerType } from "../../enums/Data";
import { Reference } from "../Reference";

export interface ContainerReference<D extends ContainerType = ContainerType>
  extends Reference<D> {
  parentId: string;
  type: D;
}
