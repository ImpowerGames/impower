import { SparkContext } from "../../../../spark-engine";
import { SparkContainer } from "../plugins/projection";
import { SparkApplication } from "./wrappers/SparkApplication";
import { SparkAssets } from "./wrappers/SparkAssets";
import { SparkRectangle } from "./wrappers/SparkRectangle";
import { SparkRenderer } from "./wrappers/SparkRenderer";

export class SparkScene {
  private _context: SparkContext;

  public get context(): SparkContext {
    return this._context;
  }

  private _app: SparkApplication;

  public get screen(): SparkRectangle {
    return this._app.screen as SparkRectangle;
  }

  public get view(): HTMLCanvasElement {
    return this._app.view as HTMLCanvasElement;
  }

  public get renderer(): SparkRenderer {
    return this._app.renderer;
  }

  public get assets(): SparkAssets {
    return this._app.assets;
  }

  public get maxFPS(): number {
    return this._app.ticker?.maxFPS;
  }

  public get stage(): SparkContainer {
    return this._app.stage as SparkContainer;
  }

  constructor(context: SparkContext, app: SparkApplication) {
    this._context = context;
    this._app = app;
  }

  async load(): Promise<void> {
    // NoOp
  }

  init(): void {
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

  quit(): void {
    if (this._app) {
      this._app.destroy(true);
    }
  }
}
