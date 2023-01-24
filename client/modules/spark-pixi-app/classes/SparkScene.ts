import { SparkContext } from "../../../../spark-engine";
import { SparkApplication } from "./wrappers/SparkApplication";
import { SparkSprite } from "./wrappers/SparkSprite";

export class SparkScene {
  private _context: SparkContext;

  public get context(): SparkContext {
    return this._context;
  }

  private _app: SparkApplication;

  public get app(): SparkApplication {
    return this._app;
  }

  private _entities: Record<string, SparkSprite>;

  public get entities(): Record<string, SparkSprite> {
    return this._entities;
  }

  constructor(
    context: SparkContext,
    app: SparkApplication,
    entities: Record<string, SparkSprite>
  ) {
    this._context = context;
    this._app = app;
    this._entities = entities;
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

  update(_timeMS?: number, _deltaMS?: number): void {
    // NoOp
  }

  destroy(): void {
    // NoOp
  }

  resize(): void {
    // NoOp
  }
}
