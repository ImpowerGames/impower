/**
 * A function that is called every tick.
 */
type TickerCallback = (time: Ticker) => void;

/**
 * A function that requests a new frame.
 */
interface FrameRequestCallback {
  (): void;
}

/**
 * Reports a current time in seconds.
 */
interface Clock {
  currentTime: number;
}

export class Ticker {
  protected _speed = 1;
  /**
   * Speeds up or slows down the clock by this factor.
   * @default 1
   */
  get speed() {
    return this._speed;
  }
  set speed(value: number) {
    this._speed = value;
  }

  protected _maxFPS = 60;
  /**
   * Limits the frame rate to a certain number of frames per second.
   * (When set to `0`, then there is no limit and the ticker will render as many frames as it can.)
   * @default 60
   */
  get maxFPS() {
    return this._maxFPS;
  }
  set maxFPS(value: number) {
    this._maxFPS = value;
  }

  protected _running = false;
  /**
   * Whether the clock is running or not.
   * @default false
   */
  get running() {
    return this._running;
  }

  protected _startTime = 0;
  /**
   * The time in seconds that the clock started running.
   * @default 0
   */
  get startTime() {
    return this._startTime;
  }

  protected _prevTime = 0;
  /**
   * The time in seconds that previous update happened.
   * @default 0
   */
  get prevTime() {
    return this._prevTime;
  }

  protected _deltaTime = 0;
  /**
   * The time in seconds that elapsed between the previous and current update.
   * @default 0
   */
  get deltaTime() {
    return this._deltaTime;
  }

  /**
   * The time in milliseconds that elapsed between the previous and current update.
   * @default 0
   */
  get deltaMS() {
    return this._deltaTime * 1000;
  }

  protected _elapsedTime = 0;
  /**
   * The total time in seconds that the clock has been running.
   * @default 0
   */
  get elapsedTime() {
    return this._elapsedTime;
  }

  protected _elapsedFrames = 0;
  /**
   * The total number of frames since the clock started running.
   * @default 0
   */
  get elapsedFrames() {
    return this._elapsedFrames;
  }

  /**
   * The frames per second that the clock is currently ticking at (bounded by {@link Ticker.maxFPS}).
   */
  get currentFPS() {
    return 1 / (this._elapsedTime / this._elapsedFrames);
  }

  /**
   * The clock that the ticker is synchronized to.
   */
  protected _clock: Clock;

  /**
   * The function that will be called to request a new frame.
   */
  protected _requestFrame: (callback: FrameRequestCallback) => void;

  /**
   * Used to offset the current time when synchronizing to a new clock.
   * @default 0
   */
  protected _timeOffset = 0;

  /**
   * The currently registered callbacks.
   */
  protected _callbacks = new Set<TickerCallback>();

  constructor(
    clock: Clock,
    requestFrame: (callback: FrameRequestCallback) => void
  ) {
    this._clock = clock;
    this._requestFrame = requestFrame;
  }

  /**
   * Register a function that will be called every tick.
   */
  add(callback: TickerCallback) {
    this._callbacks.add(callback);
  }

  /**
   * Remove a callback.
   */
  remove(callback: TickerCallback) {
    this._callbacks.delete(callback);
  }

  /**
   * Remove all callbacks.
   */
  dispose() {
    this._callbacks.clear();
  }

  /**
   * Get current time in seconds.
   */
  protected getCurrentTime(): number {
    return this._clock.currentTime + this._timeOffset;
  }

  /**
   * Synchronize the ticker to a different clock.
   */
  syncToClock(clock: Clock) {
    const oldNow = this._clock.currentTime;
    const newNow = clock.currentTime;
    this._clock = clock;
    this._timeOffset = oldNow - newNow;
  }

  /**
   * Start the ticker.
   */
  start() {
    this._running = true;
    const now = this.getCurrentTime();
    this._prevTime = now;
    this._startTime = now;
    this.loop();
  }

  /**
   * Stop the ticker.
   */
  stop() {
    this._running = false;
  }

  /**
   * Adjusts the ticker's time by a specified number of seconds.
   * Positive values will move time forward, negative values will move it backward.
   */
  adjustTime(seconds: number) {
    this._timeOffset += seconds;
    // Adjust previous and start times so delta and elapsed time remain consistent
    this._prevTime += seconds;
    this._startTime += seconds;
  }

  /**
   * The clock loop.
   */
  protected loop = () => {
    if (!this._running) {
      return;
    }

    const frameInterval = 1 / this._maxFPS;
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
