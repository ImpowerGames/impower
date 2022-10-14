import { Scene } from "../Scene";

export class PreviewScene extends Scene {
  start(): void {
    this.sparkContext?.game?.entity?.events?.onSpawnEntity?.addListener(
      (data) => this.spawnEntity(data)
    );
    this.sparkContext?.game?.entity?.events?.onDestroyEntity?.addListener(
      (data) => this.destroyEntity(data)
    );
  }

  spawnEntity(data: { id: string }): void {
    console.log("spawn", data.id);
  }

  destroyEntity(data: { id: string }): void {
    console.log("destroy", data.id);
  }
}
