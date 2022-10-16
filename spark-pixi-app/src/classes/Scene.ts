import { SparkContext } from "../../../spark-engine";
import { SparkApplication } from "./wrappers/SparkApplication";

export class Scene {
  private _sparkContext: SparkContext;

  public get sparkContext(): SparkContext {
    return this._sparkContext;
  }

  private _app: SparkApplication;

  public get app(): SparkApplication {
    return this._app;
  }

  constructor(sparkContext: SparkContext, app: SparkApplication) {
    this._sparkContext = sparkContext;
    this._app = app;
  }

  async init(): Promise<void> {
    // NoOp
  }

  start(): void {
    // NoOp
  }

  update(_time?: number, _delta?: number): void {
    // NoOp
  }

  destroy(): void {
    // NoOp
  }

  resize(): void {
    // NoOp
  }
}
