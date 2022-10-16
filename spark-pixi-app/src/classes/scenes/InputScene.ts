import { SparkScene } from "../SparkScene";

export class InputScene extends SparkScene {
  start(): void {
    this.app.stage.on("pointerdown", (e, g) => this.onPointerDown(e, g));
    this.app.stage.on("pointerup", (e, g) => this.onPointerUp(e, g));
  }

  onPointerDown(event: PointerEvent, gameObjects: { name: string }[]): void {
    this.context?.game?.input?.pointerDown(
      event.button,
      gameObjects.map((x) => x.name)
    );
  }

  onPointerUp(event: PointerEvent, gameObjects: { name: string }[]): void {
    this.context?.game?.input?.pointerUp(
      event.button,
      gameObjects.map((x) => x.name)
    );
  }
}
