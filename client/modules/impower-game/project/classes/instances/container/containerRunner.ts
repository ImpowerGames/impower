import { ContainerData } from "../../../../data";
import { InstanceRunner } from "../../instance/instanceRunner";

export abstract class ContainerRunner<
  T extends ContainerData
> extends InstanceRunner<T> {}
