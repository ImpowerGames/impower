import {
  CameraState,
  EntityState,
  SparkContext,
} from "../../../../../spark-engine";
import { Marquee } from "../../plugins/shape-graphics";
import { SparkScene } from "../SparkScene";
import { SparkApplication } from "../wrappers/SparkApplication";

export class PreviewScene extends SparkScene {
  private _marquee: Marquee;

  private _dragging = false;

  constructor(context: SparkContext, app: SparkApplication) {
    super(context, app);
    this._marquee = new Marquee({
      dash: 4,
      dashSpace: 4,
      thickness: 1,
      speed: 0.4,
      fillStyle: "blue",
    });
    this._marquee.alpha = 0.8;
    this._marquee.visible = false;
  }

  override init(): void {
    this.stage.addChild(this._marquee);
    this.stage.interactive = true;
    this.stage.hitArea = this.screen;
  }

  override start(): void {
    this.context?.game?.world?.events?.onAddCamera?.addListener((data) =>
      this.addCamera(data)
    );
    this.context?.game?.world?.events?.onRemoveCamera?.addListener((data) =>
      this.removeCamera(data)
    );
    this.context?.game?.world?.events?.onSpawnEntity?.addListener((data) =>
      this.spawnEntity(data)
    );
    this.context?.game?.world?.events?.onDestroyEntity?.addListener((data) =>
      this.destroyEntity(data)
    );
    this.stage.on("pointerdown", (e) => {
      this._dragging = true;
      this._marquee.position.copyFrom(e.data.global);
      this._marquee.visible = true;
      this._marquee.setSize(0, 0, 2, 2);
    });
    this.stage.on("pointermove", (e) => {
      if (this._dragging) {
        const width = e.data.global.x - this._marquee.x;
        const height = e.data.global.y - this._marquee.y;
        this._marquee.setSize(0, 0, width, height);
      }
    });
    this.stage.on("pointerup", () => {
      this._dragging = false;
    });
  }

  addCamera(data: { cameraId: string; cameraState: CameraState }): void {
    console.warn("add camera", data.cameraId, data.cameraState);
  }

  removeCamera(data: { cameraId: string }): void {
    console.warn("remove camera", data.cameraId);
  }

  spawnEntity(data: {
    entityId: string;
    cameraId?: string;
    entityState: EntityState;
  }): void {
    console.warn(
      "spawn entity",
      data.entityId,
      data.cameraId,
      data.entityState
    );
  }

  destroyEntity(data: { entityId: string; cameraId?: string }): void {
    console.warn("destroy entity", data.entityId, data.cameraId);
  }
}
