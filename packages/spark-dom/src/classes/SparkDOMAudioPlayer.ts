import { SynthBuffer } from "../../../spark-engine/src/game/sound/classes/SynthBuffer";

export class SparkDOMAudioPlayer {
  protected _gainNode: GainNode;

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

  protected _loop = false;
  public get loop() {
    return this._loop;
  }
  public set loop(value: boolean) {
    this._loop = value;
    if (this.sourceNode) {
      this.sourceNode.loop = value;
    }
  }

  public get duration(): number {
    return this._sourceNode?.buffer?.duration ?? 0;
  }

  protected _started = false;
  public get started(): boolean {
    return this._started;
  }

  protected _startedAt = 0;

  protected _pausedAt = 0;

  constructor(
    sound: AudioBuffer | Float32Array | SynthBuffer,
    audioContext: AudioContext
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

  protected fade(when: number, value: number, duration: number): void {
    const endTime = when + (duration || 0);
    this._gainNode.gain.linearRampToValueAtTime(value, endTime);
  }

  protected play(when: number, offsetInSeconds = 0, fadeDuration = 0): void {
    this._started = true;
    this.load();
    if (this._sourceNode) {
      const validOffset = Math.min(Math.max(0, offsetInSeconds), this.duration);
      this._sourceNode.start(when, validOffset);
      this.fade(when, 1, fadeDuration);
    }
  }

  start(when: number, offset = 0): void {
    this.play(when, offset);
    this._startedAt = when;
    this._pausedAt = 0;
  }

  stop(when: number, fadeDuration = 0.05, onDisconnected?: () => void): void {
    this._pausedAt = 0;
    this._startedAt = 0;
    if (this._started) {
      let startTime = performance.now();
      const targetSourceNode = this._sourceNode;
      this.fade(when, 0, fadeDuration);
      const disconnectAfterFade = () => {
        if (performance.now() < startTime + fadeDuration + 0.001) {
          window.requestAnimationFrame(disconnectAfterFade);
        } else {
          // Disconnect source node after finished fading out
          if (this._sourceNode && this._sourceNode === targetSourceNode) {
            this._sourceNode.stop(0);
            this._sourceNode.disconnect();
            this._sourceNode = undefined;
          }
          this._started = false;
          onDisconnected?.();
        }
      };
      disconnectAfterFade();
    }
  }

  pause(when: number, fadeDuration = 0.025) {
    const startedAt = this._startedAt;
    const elapsed = when - startedAt;
    this.stop(fadeDuration);
    this._pausedAt = elapsed;
  }

  unpause(when: number) {
    const offset = this._pausedAt;
    this.play(when, offset);
    this._startedAt = when - offset;
    this._pausedAt = 0;
  }

  step(when: number, deltaSeconds: number) {
    if (this._started) {
      this.start(when, when + deltaSeconds);
    }
  }
}
