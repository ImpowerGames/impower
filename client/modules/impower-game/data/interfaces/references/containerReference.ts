import { ContainerType } from "../../enums/data";
import { Reference } from "../reference";

export interface ContainerReference<D extends ContainerType = ContainerType>
  extends Reference<D> {
  parentContainerType: D;
  parentContainerId: string;
  refType: D;
}
