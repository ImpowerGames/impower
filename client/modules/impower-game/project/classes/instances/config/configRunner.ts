import { ConfigData } from "../../../../data";
import { InstanceRunner } from "../../instance/instanceRunner";

export class ConfigRunner<
  T extends ConfigData = ConfigData
> extends InstanceRunner<T> {
  private static _instance: ConfigRunner;

  public static get instance(): ConfigRunner {
    if (!this._instance) {
      this._instance = new ConfigRunner();
    }
    return this._instance;
  }
}
