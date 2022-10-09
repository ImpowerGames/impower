export class AnimationControl {
  lastTime = 0;

  elapsedDuration = 0;

  paused = false;

  reset(): void {
    this.elapsedDuration = 0;
  }

  pause(): void {
    this.paused = true;
  }

  unpause(): void {
    this.paused = false;
  }

  update(now: number): void {
    if (!this.lastTime) {
      this.lastTime = now;
    }
    const delta = now - this.lastTime;
    if (!this.paused) {
      this.elapsedDuration += delta;
    }
    this.lastTime = now;
  }
}
