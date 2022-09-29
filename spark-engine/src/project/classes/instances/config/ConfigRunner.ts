import { ConfigData } from "../../../../data";
import { InstanceRunner } from "../../instance/InstanceRunner";

export class ConfigRunner<
  T extends ConfigData = ConfigData
> extends InstanceRunner<T> {}
