import * as PIXI from "pixi.js";
import { SparkContext } from "../../../../spark-engine";
import { SVGLoader } from "./SVGLoader";

export class Scene {
  private _sparkContext: SparkContext;

  public get sparkContext(): SparkContext {
    return this._sparkContext;
  }

  private _app: PIXI.Application;

  public get app(): PIXI.Application {
    return this._app;
  }

  private _loader: PIXI.Loader;

  public get loader(): PIXI.Loader {
    return this._loader;
  }

  private _svgLoader: SVGLoader;

  public get svgLoader(): SVGLoader {
    return this._svgLoader;
  }

  constructor(
    sparkContext: SparkContext,
    app: PIXI.Application,
    loader: PIXI.Loader,
    svgLoader: SVGLoader
  ) {
    this._sparkContext = sparkContext;
    this._app = app;
    this._loader = loader;
    this._svgLoader = svgLoader;
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
}
