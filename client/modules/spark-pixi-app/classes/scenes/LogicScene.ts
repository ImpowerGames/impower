import { SparkScene } from "../SparkScene";

export class LogicScene extends SparkScene {
  onPointerDown = (event: PointerEvent): void => {
    this.context.game.input.pointerDown(event.button, this.stage?.name || "");
  };

  onPointerUp = (event: PointerEvent): void => {
    this.context.game.input.pointerUp(event.button, this.stage?.name || "");
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
    const timeMS = time * 1000;
    const deltaMS = delta * 1000;
    if (!this.context.update(timeMS, deltaMS)) {
      this.quit();
    }
  }
}
