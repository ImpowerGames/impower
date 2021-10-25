import { VariableData } from "./variableData";
import { ItemRunner } from "../../item/itemRunner";

export class VariableRunner<
  D extends VariableData = VariableData
> extends ItemRunner<D> {
  private static _instance: VariableRunner;

  public static get instance(): VariableRunner {
    if (!this._instance) {
      this._instance = new VariableRunner();
    }
    return this._instance;
  }
}
