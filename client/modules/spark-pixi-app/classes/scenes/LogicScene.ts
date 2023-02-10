import { SparkScene } from "../SparkScene";

export class LogicScene extends SparkScene {
  onPointerDown = (event: PointerEvent): void => {
    this.context.game.input.pointerDown(event.button, "");
  };

  onPointerUp = (event: PointerEvent): void => {
    this.context.game.input.pointerUp(event.button, "");
  };

  override start(): void {
    this.view.addEventListener("pointerdown", this.onPointerDown);
    this.view.addEventListener("pointerup", this.onPointerUp);
  }

  override destroy(): void {
    this.view.removeEventListener("pointerdown", this.onPointerDown);
    this.view.removeEventListener("pointerup", this.onPointerUp);
  }

  override update(time: number, delta: number): void {
    if (!this.context.update(time, delta)) {
      this.quit();
    }
  }
}
