const DEFAULT_FADE_DURATION = 0.016;

type AudioListener = (
  this: AudioBufferSourceNode,
  ev: AudioScheduledSourceNodeEventMap[keyof AudioScheduledSourceNodeEventMap]
) => any;

interface AudioInstance {
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
  startedAt: number;
  pausedAt?: number;
  willDisconnect?: boolean;
  ended: Promise<AudioInstance>;
  onEnded: (value: AudioInstance | PromiseLike<AudioInstance>) => void;
}

export default class AudioPlayer {
  protected _audioBuffer: AudioBuffer;
  public get audioBuffer() {
    return this._audioBuffer;
  }

  protected _audioContext: AudioContext;
  public get context() {
    return this._audioContext;
  }

  protected _volumeNode: GainNode;
  public get volumeNode() {
    return this._volumeNode;
  }

  protected _instances: AudioInstance[] = [];
  public get instances() {
    return this._instances;
  }

  public get playing() {
    return this._instances.length > 0;
  }

  protected _pitchBend = 0;
  public get pitchBend() {
    return this._pitchBend;
  }
  public set pitchBend(value) {
    this._pitchBend = value;
    this._instances.forEach((instance) => {
      instance.sourceNode.detune.value = (value ?? 0) * 100;
    });
  }

  public get duration(): number {
    return this._audioBuffer?.duration ?? 0;
  }

  protected _destination?: GainNode | AudioInstance | AudioParam;

  protected _loop = false;
  public get loop() {
    return this._loop;
  }
  public set loop(value) {
    this._loop = value;
    this._instances.forEach((instance) => {
      instance.sourceNode.loop = value;
    });
  }

  protected _loopStart = 0;
  public get loopStart() {
    return this._loopStart;
  }
  public set loopStart(value) {
    this._loopStart = value;
    this._instances.forEach((instance) => {
      instance.sourceNode.loopStart = value;
    });
  }

  protected _loopEnd = 0;
  public get loopEnd() {
    return this._loopEnd;
  }
  public set loopEnd(value) {
    this._loopEnd = value;
    this._instances.forEach((instance) => {
      instance.sourceNode.loopEnd = value;
    });
  }

  protected _gain = 1;
  public get gain() {
    return this._gain;
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
      destination?: GainNode | AudioInstance | AudioParam;
      cues?: number[];
      loop?: boolean;
      loopStart?: number;
      loopEnd?: number;
      volume?: number;
    }
  ) {
    this._audioBuffer = audioBuffer;
    this._audioContext = audioContext;
    this._destination = options?.destination;
    this._cues = options?.cues ?? this._cues;
    this._loop = options?.loop ?? this._loop;
    this._loopStart = options?.loopStart ?? this._loopStart;
    this._loopEnd = options?.loopEnd ?? this._loopEnd;
    const volume = options?.volume ?? 1;
    this._volumeNode = this._audioContext.createGain();
    this._volumeNode.gain.value = volume;
    const destination = this._destination ?? this._audioContext.destination;
    this._volumeNode.connect(destination as unknown as AudioParam);
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
    this._instances.forEach((instance) => {
      instance.sourceNode.removeEventListener("ended", listener, options);
    });
  }

  secondsToApproximateTimeConstant(sec: number = 0) {
    return (sec * 2) / 10;
  }

  dispose() {
    [...this._instances].forEach((instance) => this._disconnect(instance));
  }

  protected _disconnect(instance: AudioInstance) {
    instance.sourceNode.stop(0);
    instance.sourceNode.disconnect();
    const nodeIndex = this._instances.indexOf(instance);
    if (nodeIndex >= 0) {
      this._instances.splice(nodeIndex, 1);
    }
    instance.onEnded(instance);
  }

  protected _play(
    when: number = 0,
    offset?: number,
    duration?: number,
    gain?: number
  ): AudioInstance {
    const gainNode = this._audioContext.createGain();
    if (gain != null) {
      gainNode.gain.value = gain;
    }
    const sourceNode = this._audioContext.createBufferSource();
    const instance = {
      gainNode: gainNode,
      sourceNode: sourceNode,
      startedAt: when,
    } as AudioInstance;
    instance.ended = new Promise<AudioInstance>((resolve) => {
      instance.onEnded = resolve;
    });
    // Setup gain node
    gainNode.connect(this._volumeNode);
    // Setup source node
    sourceNode.detune.value = this._pitchBend * 100;
    sourceNode.loop = this._loop;
    sourceNode.buffer = this._audioBuffer;
    sourceNode.addEventListener(
      "ended",
      () => {
        // Played source nodes cannot be played again.
        // So once they're finished playing, disconnect them
        this._disconnect(instance);
      },
      { once: true }
    );
    this._events.ended.forEach((options, listener) => {
      sourceNode.addEventListener("ended", listener, options);
    });
    sourceNode.connect(gainNode);
    sourceNode.start(when, offset, duration);
    this._instances.push(instance);
    return instance;
  }

  protected async _fadeAsync(
    instance: AudioInstance,
    when: number,
    value: number,
    duration?: number
  ): Promise<number> {
    instance.gainNode.gain.setTargetAtTime(
      value,
      when,
      this.secondsToApproximateTimeConstant(duration)
    );
    return new Promise<number>((resolve) => {
      let startTime = performance.now();
      if (duration) {
        const durationMS = duration * 1000;
        const awaitFade = () => {
          if (performance.now() < startTime + durationMS) {
            window.requestAnimationFrame(awaitFade);
          } else {
            resolve(this._audioContext.currentTime);
          }
        };
        awaitFade();
      } else {
        resolve(this._audioContext.currentTime);
      }
    });
  }

  protected async _stopAsync(
    instance: AudioInstance,
    when = 0,
    fadeDuration = DEFAULT_FADE_DURATION
  ): Promise<number> {
    instance.willDisconnect = true;
    const fadedAt = await this._fadeAsync(instance, when, 0, fadeDuration);
    if (instance.willDisconnect) {
      // Disconnect node after finished fading out so it can be garbage collected
      this._disconnect(instance);
    }
    return fadedAt;
  }

  async start(
    when: number = 0,
    fadeDuration = 0,
    offset?: number,
    duration?: number,
    gain?: number
  ): Promise<AudioInstance> {
    this._gain = gain ?? 1;
    const startGain = fadeDuration > 0 ? 0 : this._gain;
    const endGain = this._gain;
    if (this._loop) {
      const loopingInstance = this._instances.find(
        (instance) => instance.sourceNode.loop
      );
      if (loopingInstance) {
        loopingInstance.willDisconnect = false;
        await this._fadeAsync(loopingInstance, when, endGain, fadeDuration);
        return loopingInstance;
      }
    }
    const instance = this._play(when, offset, duration, startGain);
    instance.willDisconnect = false;
    instance.startedAt = when;
    instance.pausedAt = 0;
    await this._fadeAsync(instance, when, endGain, fadeDuration);
    return instance;
  }

  async stop(
    when = 0,
    fadeDuration = DEFAULT_FADE_DURATION
  ): Promise<number[]> {
    return Promise.all(
      [...this._instances].map((instance) =>
        this._stopAsync(instance, when, fadeDuration)
      )
    );
  }

  async fade(
    when: number,
    fadeDuration = DEFAULT_FADE_DURATION,
    gain?: number
  ): Promise<number[]> {
    if (gain != null) {
      this._gain = gain;
    }
    return Promise.all(
      this._instances.map((instance) =>
        this._fadeAsync(instance, when, this._gain, fadeDuration)
      )
    );
  }

  async pause(
    when: number,
    fadeDuration = DEFAULT_FADE_DURATION
  ): Promise<number[]> {
    return Promise.all(
      this._instances.map(async (instance) => {
        const fadedOutAt = await this._fadeAsync(
          instance,
          when,
          0,
          fadeDuration
        );
        instance.sourceNode.stop(0);
        instance.pausedAt = fadedOutAt;
        return fadedOutAt;
      })
    );
  }

  async unpause(
    when: number,
    fadeDuration = DEFAULT_FADE_DURATION
  ): Promise<number[]> {
    return Promise.all(
      this._instances.map(async (instance) => {
        if (instance.pausedAt != null) {
          const offset = instance.startedAt - instance.pausedAt;
          instance.pausedAt = undefined;
          instance.sourceNode.start(0, offset);
          const fadedInAt = await this._fadeAsync(
            instance,
            when,
            this._gain,
            fadeDuration
          );
          return fadedInAt;
        }
        return 0;
      })
    );
  }

  step(when: number, deltaSeconds: number) {
    this.stop();
    this.start(when, 0, when + deltaSeconds);
  }

  getStartedAt() {
    return this._instances[0]?.startedAt ?? this._audioContext.currentTime;
  }

  getCurrentOffset(from: number) {
    const startedAt = this.getStartedAt();
    const totalOffset = from - startedAt;
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
    const startedAt = this.getStartedAt();
    return startedAt + this.getNextCueOffset(from);
  }
}
