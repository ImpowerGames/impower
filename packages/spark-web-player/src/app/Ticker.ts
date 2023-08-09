type TickerCallback = (deltaMS: number) => void;

export default class Ticker {
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
  get oldTime() {
    return this._prevTime;
  }

  protected _deltaMS = 0;
  get deltaMS() {
    return this._deltaMS;
  }

  get currentFPS() {
    return 1000 / (this._elapsedTime / this._frameCount);
  }

  protected _elapsedTime = 0;

  protected _frameCount = 0;

  protected _callbacks = new Set<TickerCallback>();

  add(callback: TickerCallback) {
    this._callbacks.add(callback);
  }

  remove(callback: TickerCallback) {
    this._callbacks.delete(callback);
  }

  dispose() {
    this._callbacks.clear();
  }

  start() {
    this._running = true;
    this._prevTime = performance.now();
    this._startTime = this._prevTime;
    this.loop(this._startTime);
  }

  stop() {
    this._running = false;
  }

  loop = (timeMS: DOMHighResTimeStamp) => {
    if (!this._running) {
      return;
    }

    const frameIntervalMS = 1000 / this._maxFPS;

    this._deltaMS = timeMS - this._prevTime;

    if (this._deltaMS > frameIntervalMS) {
      this._prevTime = timeMS;
      this._elapsedTime = timeMS - this._startTime;
      this._frameCount += 1;
      this._callbacks.forEach((callback) => {
        callback(this._deltaMS * this._speed);
      });
    }

    requestAnimationFrame(this.loop);
  };
}
