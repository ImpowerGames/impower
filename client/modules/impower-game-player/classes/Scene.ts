import * as PIXI from "pixi.js";
import { SparkContext } from "../../../../spark-engine";

export class Scene {
  private _sparkContext: SparkContext;

  public get sparkContext(): SparkContext {
    return this._sparkContext;
  }

  private _app: PIXI.Application;

  public get app(): PIXI.Application {
    return this._app;
  }

  constructor(sparkContext: SparkContext, app: PIXI.Application) {
    this._sparkContext = sparkContext;
    this._app = app;
  }

  async init(): Promise<void> {
    // NoOp
  }

  start(): void {
    // NoOp
  }

  update(_time: number, _delta: number): void {
    // NoOp
  }

  destroy(): void {
    // NoOp
  }

  resize(): void {
    // NoOp
  }
}
