import { ItemData } from "../../../../data";
import { Game } from "../../../../game";
import { InstanceRunner } from "../../instance/InstanceRunner";

export abstract class ItemRunner<
  G extends Game,
  T extends ItemData
> extends InstanceRunner<G, T> {}
