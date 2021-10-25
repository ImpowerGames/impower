import { ConstructData } from "../../../../../data";
import { ContainerRunner } from "../../container/containerRunner";

export class ConstructRunner extends ContainerRunner<ConstructData> {
  private static _instance: ConstructRunner;

  public static get instance(): ConstructRunner {
    if (!this._instance) {
      this._instance = new ConstructRunner();
    }
    return this._instance;
  }
}
