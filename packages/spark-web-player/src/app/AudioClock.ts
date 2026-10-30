import type { AudioClockParams } from "../../../spark-engine/src/game/modules/audio/classes/messages/AudioClockMessage";

export interface AudioClockContext {
  readonly state: AudioContextState;
  readonly currentTime: number;
  readonly outputLatency?: number;
  getOutputTimestamp?(): AudioTimestamp;
}

export class AudioClock {
  protected _context?: AudioClockContext;

  protected _reading: AudioClockParams;
  get reading(): AudioClockParams {
    return this._reading;
  }

  protected _timeOrigin: number;

  protected _now: () => number;

  constructor(
    timeOrigin: number = performance.timeOrigin,
    now: () => number = () => timeOrigin + performance.now(),
  ) {
    this._timeOrigin = timeOrigin;
    this._now = now;
    this._reading = { time: now(), outputLatency: 0 };
  }

  setContext(context: AudioClockContext | undefined): AudioClockParams {
    this._context = context;
    return this.read();
  }

  read(): AudioClockParams {
    const context = this._context;
    const now = this._now();
    if (!context || context.state !== "running") {
      this._reading = { time: now, outputLatency: 0 };
      return this._reading;
    }
    const outputLatency = context.outputLatency ?? 0;
    const stamp = context.getOutputTimestamp?.();
    if (stamp?.contextTime && stamp.performanceTime) {
      this._reading = {
        time: this._timeOrigin + stamp.performanceTime,
        contextTime: stamp.contextTime + outputLatency,
        outputLatency,
      };
    } else {
      this._reading = {
        time: now,
        contextTime: context.currentTime,
        outputLatency,
      };
    }
    return this._reading;
  }

  toContextTime(time: number): number | undefined {
    const { contextTime } = this._reading;
    if (contextTime == null) {
      return undefined;
    }
    return contextTime + (time - this._reading.time) / 1000;
  }

  toDocumentTime(time: number): number {
    return time - this._timeOrigin;
  }
}
