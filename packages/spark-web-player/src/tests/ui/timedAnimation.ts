export const timeline = { currentTime: 0 };

export class TimedEffect {
  animation?: { currentTime: number | null };
  constructor(
    public target: Element,
    public keyframes: unknown,
    public timing: EffectTiming = {},
  ) {}
  getKeyframes() {
    const frames = Array.isArray(this.keyframes)
      ? this.keyframes
      : this.keyframes
        ? [this.keyframes]
        : [];
    return frames.map((frame) => ({ ...(frame as object) }));
  }
  getTiming() {
    return this.timing;
  }
  getComputedTiming() {
    const { delay = 0, duration = 0, endDelay = 0, fill = "auto" } = this.timing;
    const length = Number(duration);
    const time = this.animation?.currentTime;
    let progress: number | null = null;
    if (time != null) {
      const active = time - delay;
      if (active < 0) {
        progress = fill === "backwards" || fill === "both" ? 0 : null;
      } else if (active >= length) {
        progress = fill === "forwards" || fill === "both" ? 1 : null;
      } else {
        progress = active / length;
      }
    }
    return { endTime: delay + length + endDelay, progress };
  }
}

export const animations: TimedAnimation[] = [];

export class TimedAnimation {
  timeline = timeline;
  playbackRate = 1;
  replaceState = "active";
  finished!: Promise<TimedAnimation>;
  protected _start: number | null = null;
  protected _hold: number | null = null;
  protected _isFinished = false;
  protected _settle!: () => void;
  protected _fail!: (reason: unknown) => void;
  constructor(public effect: TimedEffect) {
    effect.animation = this;
    this.renew();
    animations.push(this);
  }
  protected renew() {
    this.finished = new Promise((resolve, reject) => {
      this._settle = () => resolve(this);
      this._fail = reject;
    });
    this.finished.catch(() => {});
  }
  get end() {
    return this.effect.getComputedTiming().endTime;
  }
  get startTime() {
    return this._start;
  }
  set startTime(value: number | null) {
    this._start = value;
    if (value != null) {
      this._hold = null;
    }
    this.update(true);
  }
  get currentTime(): number | null {
    if (this._hold != null) {
      return this._hold;
    }
    if (this._start == null) {
      return null;
    }
    return (timeline.currentTime - this._start) * this.playbackRate;
  }
  set currentTime(value: number) {
    if (this._hold != null || this._start == null) {
      this._hold = value;
    } else {
      this._start = timeline.currentTime - value / this.playbackRate;
    }
    this.update(true);
  }
  get playState() {
    const time = this.currentTime;
    if (time == null) {
      return "idle";
    }
    if (this._start == null) {
      return "paused";
    }
    return time >= this.end ? "finished" : "running";
  }
  play() {
    const time = this.currentTime;
    const seek = time == null || time < 0 || time >= this.end ? 0 : time;
    this._start = timeline.currentTime - seek / this.playbackRate;
    this._hold = null;
    this.update(true);
  }
  pause() {
    const time = this.currentTime ?? 0;
    this._start = null;
    this._hold = time;
    this.update();
  }
  finish() {
    this._start = timeline.currentTime - this.end / this.playbackRate;
    this._hold = null;
    this.update(true);
  }
  cancel() {
    this._start = null;
    this._hold = null;
    this._isFinished = false;
    this._fail(new Error("cancelled"));
    this.renew();
  }
  update(didSeek = false) {
    if (this._start != null) {
      const unconstrained = didSeek
        ? this.currentTime!
        : (timeline.currentTime - this._start) * this.playbackRate;
      if (unconstrained >= this.end) {
        this._hold = didSeek ? unconstrained : this.end;
      } else {
        if (didSeek && this._hold != null) {
          this._start = timeline.currentTime - this._hold / this.playbackRate;
        }
        this._hold = null;
      }
    }
    const finished = this.playState === "finished";
    if (finished && !this._isFinished) {
      this._settle();
    } else if (!finished && this._isFinished) {
      this.renew();
    }
    this._isFinished = finished;
  }
}
