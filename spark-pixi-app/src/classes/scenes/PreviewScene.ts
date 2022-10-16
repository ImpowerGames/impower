import { SparkScene } from "../SparkScene";

export class PreviewScene extends SparkScene {
  start(): void {
    this.context?.game?.world?.events?.onSpawnEntity?.addListener((data) =>
      this.spawnEntity(data)
    );
    this.context?.game?.world?.events?.onDestroyEntity?.addListener((data) =>
      this.destroyEntity(data)
    );
  }

  spawnEntity(data: { entityId: string; cameraId?: string }): void {
    console.log("spawn", data.entityId, data.cameraId);
  }

  destroyEntity(data: { entityId: string; cameraId?: string }): void {
    console.log("destroy", data.entityId, data.cameraId);
  }
}
