import { ContainerData } from "../../../../data";
import { InstanceRunner } from "../../instance/InstanceRunner";

export abstract class ContainerRunner<
  T extends ContainerData
> extends InstanceRunner<T> {}
