import Phaser from "phaser";

export const MAIN_SCENE_KEY = "PhaserMainScene";

export class PhaserMainScene extends Phaser.Scene {
  start = true;

  update(): void {
    if (this.start) {
      this.game.events.emit("start");
      this.start = false;
    }
  }
}
