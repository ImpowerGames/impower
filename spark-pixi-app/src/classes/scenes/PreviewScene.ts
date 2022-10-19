import { CameraState, EntityState } from "../../../../spark-engine";
import { Marquee } from "../../plugins/editor-graphics";
import { SparkScene } from "../SparkScene";

export class PreviewScene extends SparkScene {
  private _dragging = false;

  private _marquee: Marquee;

  init(): void {
    this._marquee = new Marquee({
      dash: 4,
      dashSpace: 4,
      thickness: 1,
      speed: 0.4,
      fillStyle: "blue",
    });
    this._marquee.alpha = 0.8;
    this._marquee.visible = false;

    this.app.stage.addChild(this._marquee);
    this.app.stage.interactive = true;
    this.app.stage.hitArea = this.app.screen;
  }

  start(): void {
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
    this.app.stage.on("pointerdown", (e) => {
      this._dragging = true;
      this._marquee.position.copyFrom(e.data.global);
      this._marquee.visible = true;
      this._marquee.setSize(0, 0, 2, 2);
    });
    this.app.stage.on("pointermove", (e) => {
      if (this._dragging) {
        const width = e.data.global.x - this._marquee.x;
        const height = e.data.global.y - this._marquee.y;
        this._marquee.setSize(0, 0, width, height);
      }
    });
    this.app.stage.on("pointerup", () => {
      this._dragging = false;
    });
  }

  addCamera(data: { cameraId: string; cameraState: CameraState }): void {
    console.log("add camera", data.cameraId, data.cameraState);
  }

  removeCamera(data: { cameraId: string }): void {
    console.log("remove camera", data.cameraId);
  }

  spawnEntity(data: {
    entityId: string;
    cameraId?: string;
    entityState: EntityState;
  }): void {
    console.log("spawn entity", data.entityId, data.cameraId, data.entityState);
  }

  destroyEntity(data: { entityId: string; cameraId?: string }): void {
    console.log("destroy entity", data.entityId, data.cameraId);
  }
}
