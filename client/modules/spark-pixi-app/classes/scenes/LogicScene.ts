import { FederatedPointerEvent } from "pixi.js";
import { SparkScene } from "../SparkScene";

export class LogicScene extends SparkScene {
  onPointerDown = (event: PointerEvent): void => {
    this.context.game.input.pointerDown(
      event.button,
      this.app.stage?.name || ""
    );
  };

  onPointerUp = (event: PointerEvent): void => {
    this.context.game.input.pointerUp(event.button, this.app.stage?.name || "");
  };

  override start(): void {
    const uiEl = document.getElementById("spark-overlay");
    if (uiEl) {
      uiEl.addEventListener("pointerdown", this.onPointerDown);
      uiEl.addEventListener("pointerup", this.onPointerUp);
    }
    if (this.app.stage) {
      this.app.stage.interactive = true;
      this.app.stage.addEventListener(
        "pointerdown",
        (event: FederatedPointerEvent) => this.onPointerDown(event)
      );
      this.app.stage.addEventListener(
        "pointerup",
        (event: FederatedPointerEvent) => this.onPointerUp(event)
      );
    }
  }

  override destroy(): void {
    const uiEl = document.getElementById("ui");
    if (uiEl) {
      uiEl.removeEventListener("pointerdown", this.onPointerDown);
      uiEl.removeEventListener("pointerup", this.onPointerUp);
    }
    if (this.app.stage) {
      this.app.stage.removeEventListener("pointerdown", this.onPointerDown);
      this.app.stage.removeEventListener("pointerup", this.onPointerUp);
    }
  }

  override update(timeMS: number, deltaMS: number): void {
    if (!this.context.update(timeMS, deltaMS)) {
      this.app.destroy(true);
    }
  }
}
