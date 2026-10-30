type TickerCallback = (time: Clock) => void;

export interface FrameRequestCallback {
  (): void;
}

export interface ClockSource {
  currentTime: number;
}

export class Clock {
  protected _speed = 1;
  get speed() {
    return this._speed;
  }
  set speed(value: number) {
    this._speed = value;
  }

  protected _maxFPS = 60;
  get maxFPS() {
    return this._maxFPS;
  }
  set maxFPS(value: number) {
    this._maxFPS = value;
  }

  protected _running = false;
  get running() {
    return this._running;
  }

  protected _startTime = 0;
  get startTime() {
    return this._startTime;
  }

  protected _prevTime = 0;
  get prevTime() {
    return this._prevTime;
  }

  protected _deltaTime = 0;
  get deltaTime() {
    return this._deltaTime;
  }

  get deltaMS() {
    return this._deltaTime * 1000;
  }

  protected _elapsedTime = 0;
  get elapsedTime() {
    return this._elapsedTime;
  }

  protected _elapsedFrames = 0;
  get elapsedFrames() {
    return this._elapsedFrames;
  }

  get currentFPS() {
    return 1 / (this._elapsedTime / this._elapsedFrames);
  }

  get deltaFrames(): number {
    return this._deltaTime * this.maxFPS;
  }

  protected _clock: ClockSource;

  protected _requestFrame: (callback: FrameRequestCallback) => number;

  protected _timeOffset = 0;

  protected _callbacks = new Set<TickerCallback>();

  constructor(
    clock: ClockSource,
    requestFrame: (callback: FrameRequestCallback) => number,
  ) {
    this._clock = clock;
    this._requestFrame = requestFrame;
  }

  add(callback: TickerCallback) {
    this._callbacks.add(callback);
  }

  remove(callback: TickerCallback) {
    this._callbacks.delete(callback);
  }

  dispose() {
    this._callbacks.clear();
  }

  protected getCurrentTime(): number {
    return this._clock.currentTime + this._timeOffset;
  }

  syncToClock(clock: ClockSource) {
    const oldEffective = this.getCurrentTime();
    this._clock = clock;
    this._timeOffset = oldEffective - clock.currentTime;
  }

  start() {
    this._running = true;
    const now = this.getCurrentTime();
    this._prevTime = now;
    this._startTime = now;
    this.loop();
  }

  stop() {
    this._running = false;
  }

  adjustTime(seconds: number) {
    this._timeOffset += seconds;
    this._prevTime += seconds;
    this._startTime += seconds;
  }

  protected loop = () => {
    if (!this._running) {
      return;
    }

    const frameInterval = this._maxFPS > 0 ? 1 / this._maxFPS : 0;
    const currentTime = this.getCurrentTime();

    const rawDeltaTime = currentTime - this._prevTime;

    if (rawDeltaTime > frameInterval) {
      this._prevTime = currentTime;
      this._deltaTime = rawDeltaTime * this._speed;
      if (this._speed !== 0) {
        this._elapsedTime += this._deltaTime;
        this._elapsedFrames += 1;
      }
      this._callbacks.forEach((callback) => {
        callback(this);
      });
    }

    this._requestFrame(this.loop);
  };
}
