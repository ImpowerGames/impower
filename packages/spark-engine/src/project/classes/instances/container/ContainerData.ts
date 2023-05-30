import { ContainerType } from "../../../../data/enums/Data";
import { ContainerReference } from "../../../../data/interfaces/references/ContainerReference";
import { InstanceData } from "../../instance/InstanceData";

export interface ContainerData<
  D extends ContainerType = ContainerType,
  R extends ContainerReference<D> = ContainerReference<D>
> extends InstanceData<D, R> {
  level: number;
  index: number;
  name: string;
  parent: string;
  children: string[];
}
