import { ConfigData } from "../../../../data";
import { Game } from "../../../../game";
import { InstanceRunner } from "../../instance/InstanceRunner";

export class ConfigRunner<
  G extends Game,
  T extends ConfigData = ConfigData
> extends InstanceRunner<G, T> {}
