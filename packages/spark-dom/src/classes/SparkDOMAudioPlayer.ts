import type { SynthBuffer } from "../../../spark-engine/src/game/sound/classes/SynthBuffer";

const DEFAULT_FADE_DURATION = 0.025;

export class SparkDOMAudioPlayer {
  protected _gainNode: GainNode;
  public get gainNode(): GainNode {
    return this._gainNode;
  }

  protected _context: AudioContext;
  public get context(): AudioContext {
    return this._context;
  }

  protected _sourceNode?: AudioBufferSourceNode;
  public get sourceNode(): AudioBufferSourceNode | undefined {
    return this._sourceNode;
  }

  protected _soundBuffer?: Float32Array;
  public get soundBuffer(): Float32Array | undefined {
    return this._soundBuffer;
  }

  protected _audioBuffer?: AudioBuffer;
  public get audioBuffer(): AudioBuffer | undefined {
    return this._audioBuffer;
  }

  protected _synthBuffer?: SynthBuffer;
  public get synthBuffer(): SynthBuffer | undefined {
    return this._synthBuffer;
  }

  public get currentTime(): number {
    if (this._pausedAt) {
      return this._pausedAt;
    }
    if (this._startedAt) {
      return this._context.currentTime - this._startedAt;
    }
    return 0;
  }

  public set pitchBend(semitones: number) {
    if (this.sourceNode) {
      this.sourceNode.detune.value = ((semitones ?? 0) - 3) * 100;
    }
  }

  public get duration(): number {
    return this._sourceNode?.buffer?.duration ?? 0;
  }

  protected _started = false;
  public get started(): boolean {
    return this._started;
  }

  protected _loop = false;
  public get loop() {
    return this._loop;
  }
  public set loop(value) {
    this._loop = value;
    if (this.sourceNode) {
      this.sourceNode.loop = value;
    }
  }

  protected _volume = 1;
  public get volume() {
    return this._volume;
  }
  public set volume(value) {
    this._volume = value;
  }

  protected _startedAt = 0;
  public get startedAt() {
    return this._startedAt;
  }

  protected _pausedAt = 0;
  public get pausedAt() {
    return this._pausedAt;
  }

  protected _cues: number[] = [];
  public get cues() {
    return this._cues;
  }

  constructor(
    sound: AudioBuffer | Float32Array | SynthBuffer,
    audioContext: AudioContext,
    options?: {
      loop?: boolean;
      volume?: number;
      cues?: number[];
    }
  ) {
    this._context = audioContext;
    this._gainNode = this._context.createGain();
    this._gainNode.connect(this._context.destination);
    if (sound instanceof AudioBuffer) {
      this._audioBuffer = sound;
    } else if (sound instanceof Float32Array) {
      this._soundBuffer = sound;
    } else {
      this._soundBuffer = sound.soundBuffer;
      this._synthBuffer = sound;
    }
    this._loop = options?.loop ?? this._loop;
    this._volume = options?.volume ?? this._volume;
    this._cues = options?.cues ?? this._cues;
    this.load();
  }

  protected load(): void {
    const sampleRate = this._context.sampleRate;
    if (this._sourceNode) {
      this._sourceNode.disconnect();
    }
    this._sourceNode = this._context.createBufferSource();
    this._sourceNode.loop = this._loop;
    this._sourceNode.connect(this._gainNode);
    if (this._audioBuffer) {
      this._sourceNode.buffer = this._audioBuffer;
    } else if (this._soundBuffer) {
      const buffer = this._context.createBuffer(
        1,
        this._soundBuffer.length,
        sampleRate
      );
      buffer.copyToChannel(this._soundBuffer, 0);
      this._sourceNode.buffer = buffer;
    }
  }

  protected fade(when: number, value: number, duration?: number): void {
    this._gainNode.gain.setTargetAtTime(
      value,
      when,
      duration ?? Number.EPSILON
    );
  }

  protected play(
    when: number,
    fadeDuration = 0,
    offset?: number,
    duration?: number
  ): void {
    this._started = true;
    this.load();
    if (this._sourceNode) {
      this._sourceNode.start(when, offset, duration);
      this.fade(when, this.volume, fadeDuration);
    }
  }

  start(
    when: number,
    fadeDuration = 0,
    offset?: number,
    duration?: number
  ): void {
    this.play(when, fadeDuration, offset, duration);
    this._startedAt = when;
    this._pausedAt = 0;
  }

  stop(when: number, fadeDuration = 0.05, onDisconnected?: () => void): void {
    this._pausedAt = 0;
    this._startedAt = 0;
    const targetSourceNode = this._sourceNode;
    if (this._started) {
      let startTime = performance.now();
      this.fade(when, 0, fadeDuration);
      const disconnectAfterFade = () => {
        if (performance.now() < startTime + fadeDuration + 0.001) {
          window.requestAnimationFrame(disconnectAfterFade);
        } else {
          if (this._sourceNode && this._sourceNode === targetSourceNode) {
            // Disconnect source node after finished fading out
            this._sourceNode.stop(0);
            this._sourceNode.disconnect();
            this._sourceNode = undefined;
          }
          this._started = false;
          onDisconnected?.();
        }
      };
      disconnectAfterFade();
    } else {
      if (this._sourceNode && this._sourceNode === targetSourceNode) {
        // Disconnect right away
        this._sourceNode.stop(0);
        this._sourceNode.disconnect();
        this._sourceNode = undefined;
      }
      onDisconnected?.();
    }
  }

  stopAsync(when: number, fadeDuration = 0.05) {
    return new Promise<void>((resolve) => {
      this.stop(when, fadeDuration, resolve);
    });
  }

  fadeVolume(when: number, volume: number, fadeDuration?: number) {
    this._volume = volume;
    this.fade(when, this.volume, fadeDuration);
  }

  pause(when: number, fadeDuration = DEFAULT_FADE_DURATION) {
    const startedAt = this._startedAt;
    const elapsed = when - startedAt;
    this.stop(fadeDuration);
    this._pausedAt = elapsed;
  }

  unpause(when: number, fadeDuration = DEFAULT_FADE_DURATION) {
    const offset = this._pausedAt;
    this.play(when, fadeDuration, offset);
    this._startedAt = when - offset;
    this._pausedAt = 0;
  }

  step(when: number, deltaSeconds: number) {
    if (this._started) {
      this.start(when, when + deltaSeconds);
    }
  }

  getCurrentOffset(from: number) {
    const totalOffset = from - this._startedAt;
    if (this.loop) {
      return totalOffset % this.duration;
    }
    return totalOffset;
  }

  getNextCueOffset(from: number) {
    const currentOffset = this.getCurrentOffset(from);
    return this._cues.find((t) => t >= currentOffset) ?? this.duration;
  }

  getNextCueTime(from: number) {
    return this.startedAt + this.getNextCueOffset(from);
  }
}
