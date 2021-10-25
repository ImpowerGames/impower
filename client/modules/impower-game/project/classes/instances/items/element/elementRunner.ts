import { ElementData } from "../../../../../data";
import { ItemRunner } from "../../item/itemRunner";

export class ElementRunner<
  T extends ElementData = ElementData
> extends ItemRunner<T> {
  private static _instance: ElementRunner;

  public static get instance(): ElementRunner {
    if (!this._instance) {
      this._instance = new ElementRunner();
    }
    return this._instance;
  }
}
