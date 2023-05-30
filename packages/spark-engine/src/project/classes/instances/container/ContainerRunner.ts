import { ContainerData } from "../../../../data";
import { Game } from "../../../../game";
import { InstanceRunner } from "../../instance/InstanceRunner";

export abstract class ContainerRunner<
  G extends Game,
  T extends ContainerData
> extends InstanceRunner<G, T> {}
