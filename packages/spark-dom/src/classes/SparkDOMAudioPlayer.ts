const DEFAULT_FADE_DURATION = 0.025;

type AudioListener = (
  this: AudioBufferSourceNode,
  ev: AudioScheduledSourceNodeEventMap[keyof AudioScheduledSourceNodeEventMap]
) => any;

interface AudioNode {
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
}

export class SparkDOMAudioPlayer {
  protected _audioBuffer: AudioBuffer;
  public get audioBuffer(): AudioBuffer | undefined {
    return this._audioBuffer;
  }

  protected _audioContext: AudioContext;
  public get context(): AudioContext {
    return this._audioContext;
  }

  protected _volumeNode: GainNode;
  public get volumeNode(): GainNode {
    return this._volumeNode;
  }

  protected _nodes = new Set<AudioNode>();

  public get currentTime(): number {
    if (this._pausedAt) {
      return this._pausedAt;
    }
    if (this._startedAt) {
      return this._audioContext.currentTime - this._startedAt;
    }
    return 0;
  }

  protected _pitchBend = 0;
  public get pitchBend() {
    return this._pitchBend;
  }
  public set pitchBend(value) {
    this._pitchBend = value;
    this._nodes.forEach((node) => {
      node.sourceNode.detune.value = (value ?? 0) * 100;
    });
  }

  public get duration(): number {
    return this._audioBuffer?.duration ?? 0;
  }

  protected _mixer?: GainNode;
  public get mixer() {
    return this._mixer;
  }

  protected _loop = false;
  public get loop() {
    return this._loop;
  }
  public set loop(value) {
    this._loop = value;
    this._nodes.forEach((node) => {
      node.sourceNode.loop = value;
    });
  }

  protected _gain = 1;
  public get gain() {
    return this._gain;
  }
  public set gain(value) {
    this._gain = value;
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

  protected _events: Record<
    keyof AudioScheduledSourceNodeEventMap,
    Map<AudioListener, boolean | AddEventListenerOptions | undefined>
  > = {
    ended: new Map(),
  };

  constructor(
    audioBuffer: AudioBuffer,
    audioContext: AudioContext,
    options?: {
      mixer?: GainNode;
      cues?: number[];
      loop?: boolean;
      volume?: number;
    }
  ) {
    this._audioBuffer = audioBuffer;
    this._audioContext = audioContext;
    this._mixer = options?.mixer;
    this._cues = options?.cues ?? this._cues;
    this._loop = options?.loop ?? this._loop;
    const volume = options?.volume ?? 1;
    this._volumeNode = this._audioContext.createGain();
    this._volumeNode.gain.value = volume;
    this._volumeNode.connect(this._mixer ?? this._audioContext.destination);
  }

  protected playSound(
    when: number = 0,
    offset?: number,
    duration?: number
  ): AudioNode {
    const gainNode = this._audioContext.createGain();
    const sourceNode = this._audioContext.createBufferSource();
    const node: AudioNode = {
      gainNode: gainNode,
      sourceNode: sourceNode,
    };
    // Setup gain node
    gainNode.connect(this._volumeNode);
    // Setup source node
    sourceNode.detune.value = this._pitchBend * 100;
    sourceNode.loop = this._loop;
    sourceNode.buffer = this._audioBuffer;
    this._events.ended.forEach((options, listener) => {
      sourceNode.addEventListener("ended", listener, options);
      sourceNode.stop(0);
      sourceNode.disconnect();
      this._nodes.delete(node);
    });
    sourceNode.connect(gainNode);
    sourceNode.start(when, offset, duration);
    this._nodes.add(node);
    return node;
  }

  addEventListener<K extends keyof AudioScheduledSourceNodeEventMap>(
    type: K,
    listener: AudioListener,
    options?: boolean | AddEventListenerOptions
  ): void {
    this._events[type] ??= new Map();
    this._events[type].set(listener, options);
  }

  removeEventListener<K extends keyof AudioScheduledSourceNodeEventMap>(
    type: K,
    listener: AudioListener,
    options?: boolean | EventListenerOptions
  ): void {
    this._events[type] ??= new Map();
    this._events[type].delete(listener);
    this._nodes.forEach((node) => {
      node.sourceNode.removeEventListener("ended", listener, options);
    });
  }

  secondsToApproximateTimeConstant(sec: number = 0) {
    return (sec * 2) / 10;
  }

  protected _fade(
    gainNode: GainNode,
    when: number,
    value: number,
    duration?: number
  ): void {
    gainNode.gain.setTargetAtTime(
      value,
      when,
      this.secondsToApproximateTimeConstant(duration)
    );
  }

  start(
    when: number = 0,
    fadeDuration = 0,
    offset?: number,
    duration?: number
  ): void {
    // Reload source node so we can start from the beginning
    const node = this.playSound(when, offset, duration);
    this._fade(node.gainNode, when, this._gain, fadeDuration);
    this._startedAt = when;
    this._pausedAt = 0;
  }

  stop(when = 0, fadeDuration = 0.05, onDisconnected?: () => void): void {
    this._pausedAt = 0;
    this._startedAt = 0;
    let startTime = performance.now();
    this._nodes.forEach((node) => {
      this._fade(node.gainNode, when, 0, fadeDuration);
    });
    const disconnectAfterFade = () => {
      if (performance.now() < startTime + fadeDuration + 0.001) {
        window.requestAnimationFrame(disconnectAfterFade);
      } else {
        // Disconnect source node after finished fading out
        this._nodes.forEach((node) => {
          node.sourceNode.stop(0);
          node.sourceNode.disconnect();
        });
        this._nodes.clear();
        onDisconnected?.();
      }
    };
    disconnectAfterFade();
  }

  stopAsync(when: number, fadeDuration = 0.05) {
    return new Promise<void>((resolve) => {
      this.stop(when, fadeDuration, resolve);
    });
  }

  fadeTo(when: number, gain: number, fadeDuration?: number) {
    this._gain = gain;
    this._nodes.forEach((node) => {
      this._fade(node.gainNode, when, gain, fadeDuration);
    });
  }

  fade(when: number, fadeDuration?: number) {
    this._nodes.forEach((node) => {
      this._fade(node.gainNode, when, this._gain, fadeDuration);
    });
  }

  pause(when: number, fadeDuration = DEFAULT_FADE_DURATION) {
    const startedAt = this._startedAt;
    const elapsed = when - startedAt;
    this.stop(fadeDuration);
    this._pausedAt = elapsed;
  }

  unpause(when: number, fadeDuration = DEFAULT_FADE_DURATION) {
    const offset = this._pausedAt;
    this.start(when, fadeDuration, offset);
    this._startedAt = when - offset;
    this._pausedAt = 0;
  }

  step(when: number, deltaSeconds: number) {
    this.start(when, when + deltaSeconds);
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
    const next = this._cues?.find((t) => t >= currentOffset);
    if (next != null) {
      return next;
    }
    if (this._loop) {
      return this._cues?.[0] ?? 0;
    }
    return this.duration;
  }

  getNextCueTime(from: number) {
    if (!this._cues || this._cues.length === 0) {
      return from;
    }
    return this.startedAt + this.getNextCueOffset(from);
  }
}
