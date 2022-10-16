import { SparkScene } from "../SparkScene";

export class LogicScene extends SparkScene {
  update(time: number, delta: number): void {
    if (this.context?.loadedBlockIds) {
      this.context.loadedBlockIds.forEach((blockId) => {
        if (!this.context.update(blockId, time, delta)) {
          this.app.destroy(true);
        }
      });
    }
  }
}
