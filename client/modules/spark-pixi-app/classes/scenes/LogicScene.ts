import { SparkScene } from "../SparkScene";

export class LogicScene extends SparkScene {
  override update(time: number, delta: number): void {
    if (!this.context.update(time, delta)) {
      this.app.destroy(true);
    }
  }
}
