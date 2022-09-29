import { ContainerType } from "../../enums/Data";
import { Reference } from "../Reference";

export interface ContainerReference<D extends ContainerType = ContainerType>
  extends Reference<D> {
  parentContainerType: D;
  parentContainerId: string;
  refType: D;
}
