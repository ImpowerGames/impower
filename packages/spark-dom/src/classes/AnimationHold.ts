export default class AnimationHold {
  protected _held = false;
  get held(): boolean {
    return this._held;
  }

  protected _animations = new Set<Animation>();

  add(animation: Animation): void {
    this._animations.add(animation);
    const release = () => {
      this._animations.delete(animation);
    };
    animation.finished.then(release, release);
    if (this._held) {
      this.freeze(animation);
    }
  }

  pause(): void {
    if (this._held) {
      return;
    }
    this._held = true;
    for (const animation of this._animations) {
      this.freeze(animation);
    }
  }

  resume(): void {
    if (!this._held) {
      return;
    }
    this._held = false;
    for (const animation of this._animations) {
      const time = animation.currentTime;
      const now = animation.timeline?.currentTime;
      if (time == null || now == null || animation.playState !== "paused") {
        continue;
      }
      animation.startTime =
        Number(now) - Number(time) / animation.playbackRate;
    }
  }

  step(ms: number): void {
    for (const animation of this._animations) {
      const time = animation.currentTime;
      if (time != null) {
        animation.currentTime = Number(time) + ms * animation.playbackRate;
      }
    }
  }

  protected freeze(animation: Animation): void {
    const time = animation.currentTime;
    if (time == null || animation.playState === "paused") {
      return;
    }
    animation.pause();
    animation.currentTime = time;
  }
}
