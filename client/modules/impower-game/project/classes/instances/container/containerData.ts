import { Nameable } from "../../../../../impower-core";
import { ContainerType } from "../../../../data/enums/data";
import { ContainerReference } from "../../../../data/interfaces/references/containerReference";
import { InstanceData } from "../../instance/instanceData";

export interface ContainerData<
  D extends ContainerType = ContainerType,
  R extends ContainerReference<D> = ContainerReference<D>
> extends InstanceData<D, R>,
    Nameable {
  children: string[];
}
