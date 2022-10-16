import { SparkContext } from "../../../spark-engine";
import { SparkApplication } from "./wrappers/SparkApplication";

export class SparkScene {
  private _context: SparkContext;

  public get context(): SparkContext {
    return this._context;
  }

  private _app: SparkApplication;

  public get app(): SparkApplication {
    return this._app;
  }

  constructor(sparkContext: SparkContext, app: SparkApplication) {
    this._context = sparkContext;
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
