import { AudioClockMessage } from "@impower/spark-engine/src/game/modules/audio/classes/messages/AudioClockMessage";
import type { LoadAudioPlayerParams } from "@impower/spark-engine/src/game/modules/audio/types/LoadAudioPlayerParams";
import { AudioClock } from "../../app/AudioClock";
import AudioManager from "../../app/managers/AudioManager";

class StandInParam {
  constructor(public value: number) {}
  cancelScheduledValues() {}
  setValueAtTime(value: number) {
    this.value = value;
  }
  setTargetAtTime(value: number) {
    this.value = value;
  }
}

class StandInNode {
  outputs: StandInNode[] = [];
  gain?: StandInParam;
  connect(to: StandInNode) {
    this.outputs.push(to);
    return to;
  }
  disconnect() {
    this.outputs.length = 0;
  }
  reaches(destination: StandInNode): boolean {
    if (this === destination) {
      return true;
    }
    if (this.gain && this.gain.value <= 0) {
      return false;
    }
    return this.outputs.some((node) => node.reaches(destination));
  }
}

export interface StandInBuffer {
  key: string;
  duration: number;
  length: number;
}

export class StandInSource extends StandInNode {
  detune = new StandInParam(0);
  playbackRate = new StandInParam(1);
  loop = false;
  buffer: StandInBuffer | null = null;
  startedAt?: number;
  stopped = false;
  constructor(protected destination: StandInNode) {
    super();
  }
  addEventListener() {}
  removeEventListener() {}
  start(when: number) {
    this.startedAt = when;
  }
  stop() {
    this.stopped = true;
  }
  get key(): string {
    return this.buffer?.key ?? "";
  }
  get sounding(): boolean {
    return (
      this.startedAt != null &&
      !this.stopped &&
      this.playbackRate.value > 0 &&
      this.reaches(this.destination)
    );
  }
}

class StandInMovieSource extends StandInNode {
  constructor(
    readonly mediaElement: HTMLMediaElement,
    protected destination: StandInNode,
  ) {
    super();
  }
  get sounding(): boolean {
    return (
      !this.mediaElement.paused &&
      !this.mediaElement.muted &&
      this.reaches(this.destination)
    );
  }
}

export interface StandInAudio {
  readonly sources: StandInSource[];
  readonly running: boolean;
  sourcesOf(key: string): StandInSource[];
  sounding(): string[];
  movieSounding(video: HTMLMediaElement): boolean;
  start(): void;
  attach(app: any, emit: (message: unknown) => void): AudioManager;
}

export function createStandInAudio(
  options: { running?: boolean } = {},
): StandInAudio {
  const sources: StandInSource[] = [];
  const movies: StandInMovieSource[] = [];
  const destination = new StandInNode();
  const gainNode = () => {
    const node = new StandInNode();
    node.gain = new StandInParam(1);
    return node;
  };
  const context = {
    currentTime: 0,
    sampleRate: 48000,
    state: (options.running === false ? "suspended" : "running") as AudioContextState,
    outputLatency: 0,
    destination,
    createGain: gainNode,
    createAnalyser: () =>
      Object.assign(new StandInNode(), {
        fftSize: 2048,
        getFloatTimeDomainData() {},
      }),
    createBuffer: (_channels: number, length: number) => ({
      key: "",
      duration: length / 48000,
      length,
      copyToChannel() {},
    }),
    createBufferSource: () => {
      const source = new StandInSource(destination);
      sources.push(source);
      return source;
    },
    createMediaElementSource: (mediaElement: HTMLMediaElement) => {
      const source = new StandInMovieSource(mediaElement, destination);
      Object.assign(source, { context });
      movies.push(source);
      return source;
    },
  };
  let attached: { app: any; manager: AudioManager; emit: (m: unknown) => void } | undefined;
  const audio: StandInAudio = {
    sources,
    get running() {
      return context.state === "running";
    },
    sourcesOf: (key) => sources.filter((s) => s.key.split("~")[0] === key),
    sounding: () => [
      ...new Set(sources.filter((s) => s.sounding).map((s) => s.key.split("~")[0]!)),
    ],
    movieSounding: (video) =>
      movies.some((m) => m.mediaElement === video && m.sounding),
    start() {
      context.state = "running";
      if (!attached) {
        return;
      }
      attached.app.audioContext = context;
      attached.app.audioClock.setContext(context);
      attached.manager.onAudioContextRunning();
      attached.emit(
        AudioClockMessage.type.notification(attached.app.audioClock.read()),
      );
    },
    attach(app, emit) {
      app.audioClock = new AudioClock(0, () => 0);
      if (context.state === "running") {
        app.audioContext = context;
        app.audioClock.setContext(context);
      } else {
        app.audioContext = undefined;
      }
      const manager = new (class extends AudioManager {
        protected override async loadAudioBuffer(
          params: LoadAudioPlayerParams,
        ): Promise<AudioBuffer> {
          return {
            key: params.key,
            duration: 4,
            length: 4 * 48000,
          } as unknown as AudioBuffer;
        }
      })(app);
      app.audio = manager;
      attached = { app, manager, emit };
      return manager;
    },
  };
  return audio;
}
