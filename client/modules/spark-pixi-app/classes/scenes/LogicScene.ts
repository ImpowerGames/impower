import * as PIXI from "pixi.js";
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
    this.app.stage.interactive = true;
    this.app.stage.on("pointerdown", (event: PIXI.InteractionEvent) =>
      this.onPointerDown(event.data as unknown as PointerEvent)
    );
    this.app.stage.on("pointerup", (event: PIXI.InteractionEvent) =>
      this.onPointerUp(event.data as unknown as PointerEvent)
    );
  }

  override destroy(): void {
    const uiEl = document.getElementById("ui");
    if (uiEl) {
      uiEl.removeEventListener("pointerdown", this.onPointerDown);
      uiEl.removeEventListener("pointerup", this.onPointerUp);
    }
  }

  override update(timeMS: number, deltaMS: number): void {
    if (!this.context.update(timeMS, deltaMS)) {
      this.app.destroy(true);
    }
  }
}
