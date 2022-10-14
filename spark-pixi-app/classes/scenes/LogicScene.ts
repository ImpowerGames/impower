import { Scene } from "../Scene";

export class LogicScene extends Scene {
  update(time: number, delta: number): void {
    if (this.sparkContext?.loadedBlockIds) {
      this.sparkContext.loadedBlockIds.forEach((blockId) => {
        if (!this.sparkContext.update(blockId, time, delta)) {
          this.app.destroy(true);
        }
      });
    }
  }
}
