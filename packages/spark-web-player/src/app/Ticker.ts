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

  protected _oldTime = 0;
  get oldTime() {
    return this._oldTime;
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
    this._oldTime = performance.now();
    this._startTime = this._oldTime;
    this.loop(0);
  }

  stop() {
    this._running = false;
  }

  loop = (timeMS: DOMHighResTimeStamp) => {
    if (!this._running) {
      return;
    }

    const fpsInterval = 1000 / this._maxFPS;

    this._deltaMS = timeMS - this._oldTime;

    if (this._deltaMS > fpsInterval) {
      this._oldTime = timeMS - (this._deltaMS % fpsInterval);
      this._elapsedTime = timeMS - this._startTime;
      this._frameCount += 1;
      this._callbacks.forEach((callback) => {
        callback(this._deltaMS * this._speed);
      });
    }

    requestAnimationFrame(this.loop);
  };
}
