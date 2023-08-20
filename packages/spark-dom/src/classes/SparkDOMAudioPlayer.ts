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

  public set loop(value: boolean) {
    if (this.sourceNode) {
      this.sourceNode.loop = value;
    }
  }

  public get duration(): number {
    return this._sourceNode?.buffer?.duration ?? 0;
  }

  protected _isPlaying = false;

  protected _startedAt?: number;

  protected _pausedAt?: number;

  constructor(
    sound: AudioBuffer | Float32Array | SynthBuffer,
    audioContext?: AudioContext
  ) {
    this._context = audioContext || new AudioContext();
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

  protected fade(value: number, duration: number): void {
    const endTime = this._context.currentTime + (duration || 0);
    this._gainNode.gain.linearRampToValueAtTime(value, endTime);
  }

  protected play(offsetInSeconds = 0, fadeDuration = 0): void {
    this._isPlaying = true;
    this.load();
    if (this._sourceNode) {
      const validOffset = Math.min(Math.max(0, offsetInSeconds), this.duration);
      this._sourceNode.start(0, validOffset);
      this.fade(1, fadeDuration);
    }
  }

  start(offset = 0): void {
    this.play(offset);
    this._startedAt = this._context.currentTime;
    this._pausedAt = 0;
  }

  stop(fadeDuration = 0.025, onDisconnected?: () => void): void {
    this._pausedAt = 0;
    this._startedAt = 0;
    let startTime = performance.now();
    const targetSourceNode = this._sourceNode;
    this.fade(0, fadeDuration);
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
        this._isPlaying = false;
        onDisconnected?.();
      }
    };
    disconnectAfterFade();
  }

  pause(fadeDuration = 0.025) {
    const startedAt = this._startedAt ?? 0;
    const elapsed = this._context.currentTime - startedAt;
    this.stop(fadeDuration);
    this._pausedAt = elapsed;
  }

  unpause() {
    const offset = this._pausedAt ?? 0;
    this.play(offset);
    this._startedAt = this._context.currentTime - offset;
    this._pausedAt = 0;
  }

  step(deltaSeconds: number) {
    if (this._isPlaying) {
      this.start(this.currentTime + deltaSeconds);
    }
  }
}
