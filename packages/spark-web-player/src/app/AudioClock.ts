import type { AudioClockParams } from "../../../spark-engine/src/game/modules/audio/classes/messages/AudioClockMessage";

/** The parts of an `AudioContext` the clock reads. */
export interface AudioClockContext {
  readonly state: AudioContextState;
  readonly currentTime: number;
  readonly outputLatency?: number;
  getOutputTimestamp?(): AudioTimestamp;
}

/**
 * Maps the shared clock (`sharedNow`, milliseconds) onto the page's audio
 * context and document timeline, so a beat stamped with one start time plays
 * its sound and shows its pictures at that time however late its messages
 * are handled.
 *
 * A reading pairs an audio-context time with the shared time at which sound
 * scheduled there starts. `getOutputTimestamp` gives the context time being
 * heard at a performance time; the context schedules `outputLatency` ahead of
 * what is heard, so that is added back. A host whose timestamp is empty (a
 * context that has not rendered yet) pairs `currentTime` with now instead.
 * A context that is not running has no reading, since its time stands still.
 */
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
    this._reading = { time: now() };
  }

  /** Reads `context` from now on, or only the shared clock without one. */
  setContext(context: AudioClockContext | undefined): AudioClockParams {
    this._context = context;
    return this.read();
  }

  /** Takes a new reading. */
  read(): AudioClockParams {
    const context = this._context;
    const now = this._now();
    if (!context || context.state !== "running") {
      this._reading = { time: now };
      return this._reading;
    }
    const stamp = context.getOutputTimestamp?.();
    if (stamp?.contextTime && stamp.performanceTime) {
      this._reading = {
        time: this._timeOrigin + stamp.performanceTime,
        contextTime: stamp.contextTime + (context.outputLatency ?? 0),
      };
    } else {
      this._reading = { time: now, contextTime: context.currentTime };
    }
    return this._reading;
  }

  /** The audio-context time, in seconds, of shared time `time`. */
  toContextTime(time: number): number | undefined {
    const { contextTime } = this._reading;
    if (contextTime == null) {
      return undefined;
    }
    return contextTime + (time - this._reading.time) / 1000;
  }

  /** The document timeline's time, in milliseconds, of shared time `time`. */
  toDocumentTime(time: number): number {
    return time - this._timeOrigin;
  }
}
