import { Scene } from "../Scene";

export class InputScene extends Scene {
  start(): void {
    this.app.stage.on("pointerdown", (e, g) => this.onPointerDown(e, g));
    this.app.stage.on("pointerup", (e, g) => this.onPointerUp(e, g));
  }

  onPointerDown(event: PointerEvent, gameObjects: { name: string }[]): void {
    this.sparkContext?.game?.input?.pointerDown(
      event.button,
      gameObjects.map((x) => x.name)
    );
  }

  onPointerUp(event: PointerEvent, gameObjects: { name: string }[]): void {
    this.sparkContext?.game?.input?.pointerUp(
      event.button,
      gameObjects.map((x) => x.name)
    );
  }
}
