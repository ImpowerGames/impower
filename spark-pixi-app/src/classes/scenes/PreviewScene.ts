import { Scene } from "../Scene";

export class PreviewScene extends Scene {
  start(): void {
    this.sparkContext?.game?.world?.events?.onSpawnEntity?.addListener((data) =>
      this.spawnEntity(data)
    );
    this.sparkContext?.game?.world?.events?.onDestroyEntity?.addListener(
      (data) => this.destroyEntity(data)
    );
  }

  spawnEntity(data: { entityId: string; cameraId?: string }): void {
    console.log("spawn", data.entityId, data.cameraId);
  }

  destroyEntity(data: { entityId: string; cameraId?: string }): void {
    console.log("destroy", data.entityId, data.cameraId);
  }
}
