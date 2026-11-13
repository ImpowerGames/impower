const PRUNE_FLOOR = 64;

export default class AnimationHold {
  protected _held = false;
  get held(): boolean {
    return this._held;
  }

  protected _animations = new Map<Animation, () => void>();

  protected _pruneAt = PRUNE_FLOOR;

  add(animation: Animation): Promise<unknown> {
    let reached!: () => void;
    const reachedEnd = new Promise<void>((resolve) => {
      reached = resolve;
    });
    this._animations.set(animation, reached);
    if (this._animations.size >= this._pruneAt) {
      this.prune();
      this._pruneAt = Math.max(PRUNE_FLOOR, this._animations.size * 2);
    }
    if (this._held) {
      this.hold(animation, reached, this.position(animation));
    }
    return Promise.race([animation.finished, reachedEnd]);
  }

  pause(): void {
    if (this._held) {
      return;
    }
    this._held = true;
    this.prune();
    for (const [animation, reached] of this._animations) {
      this.hold(animation, reached, this.position(animation));
    }
  }

  resume(): void {
    if (!this._held) {
      return;
    }
    this._held = false;
    this.prune();
    for (const animation of this._animations.keys()) {
      const time = animation.currentTime;
      const now = animation.timeline?.currentTime;
      if (
        animation.playState !== "paused" ||
        time == null ||
        now == null ||
        animation.playbackRate === 0
      ) {
        continue;
      }
      animation.startTime =
        Number(now) - Number(time) / animation.playbackRate;
    }
  }

  release(): void {
    this.resume();
    this._animations.clear();
  }

  protected position(animation: Animation): number | null {
    const start = animation.startTime;
    const now = animation.timeline?.currentTime;
    const time =
      start != null && now != null
        ? (Number(now) - Number(start)) * animation.playbackRate
        : Number(animation.currentTime ?? NaN);
    return Number.isFinite(time) ? time : null;
  }

  protected endsBy(animation: Animation, time: number): boolean {
    const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
    return animation.playbackRate > 0 ? time >= end : time <= 0;
  }

  protected hold(
    animation: Animation,
    reached: () => void,
    time: number | null,
  ): void {
    if (time == null) {
      return;
    }
    animation.pause();
    animation.currentTime = time;
    if (this.endsBy(animation, time)) {
      reached();
    }
  }

  protected prune(): void {
    for (const animation of this._animations.keys()) {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      if (
        animation.playState === "idle" ||
        animation.playState === "finished" ||
        animation.replaceState === "removed" ||
        !target?.isConnected
      ) {
        this._animations.delete(animation);
      }
    }
  }
}
