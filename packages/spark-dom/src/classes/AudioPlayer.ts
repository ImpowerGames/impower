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
  stoppedAt?: number;
  disposedAt?: number;
  queueCreatedAt?: number;
  willDisconnect?: boolean;
  scheduled?: Map<number, number>;
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
    // https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime#choosing_a_good_timeconstant
    // (At 5 timeConstants, we will be 99.3% of the way to the target value)
    return sec / 5;
  }

  dispose() {
    [...this._instances].forEach((instance) => this._dispose(instance));
  }

  protected _dispose(instance: AudioInstance) {
    instance.disposedAt = this._audioContext.currentTime;
    this._disconnect(instance);
  }

  protected _disconnect(instance: AudioInstance) {
    const nodeIndex = this._instances.indexOf(instance);
    if (nodeIndex >= 0) {
      this._instances.splice(nodeIndex, 1);
    }
    instance.sourceNode.stop(0);
    instance.sourceNode.disconnect();
    instance.onEnded(instance);
  }

  protected _play(
    when: number = 0,
    gain?: number,
    offset?: number,
    duration?: number
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

  protected _fade(
    instance: AudioInstance,
    when: number,
    value: number,
    fadeDuration: number = 0,
    cancelsDisconnect = true,
    disconnectWhenDone = false
  ): void {
    if (!instance.willDisconnect || cancelsDisconnect) {
      instance.willDisconnect = disconnectWhenDone;
      // Future events scheduled after "when" should be canceled
      instance.gainNode.gain.cancelScheduledValues(when);
      instance.gainNode.gain.setTargetAtTime(
        value,
        when,
        this.secondsToApproximateTimeConstant(fadeDuration)
      );
      if (cancelsDisconnect) {
        this._cancelScheduledCallbacks(instance, when);
      }
      if (disconnectWhenDone) {
        this._scheduleCallback(instance, when + fadeDuration, () =>
          this._disconnect(instance)
        );
      }
    }
  }

  protected _scheduleCallback(
    instance: AudioInstance,
    when: number,
    callback: () => void
  ): void {
    const delay = when - this._audioContext.currentTime;
    const id = window.setTimeout(callback, delay * 1000);
    instance.scheduled ??= new Map();
    instance.scheduled.set(when, id);
  }

  protected _cancelScheduledCallbacks(
    instance: AudioInstance,
    when?: number
  ): void {
    if (instance.scheduled) {
      const oldSortedEventTimes = Array.from(instance.scheduled.keys()).sort();
      const newScheduled = new Map<number, number>();
      for (let i = 0; i < oldSortedEventTimes.length; i++) {
        const eventTime = oldSortedEventTimes[i]!;
        const eventId = instance.scheduled.get(eventTime)!;
        if (!when || eventTime >= when) {
          window.clearTimeout(eventId);
        } else {
          newScheduled.set(eventTime, eventId);
        }
      }
      instance.scheduled = newScheduled;
    }
  }

  start(
    when: number = 0,
    fadeDuration = 0,
    gain?: number,
    offset?: number,
    duration?: number
  ): AudioInstance {
    if (gain != null) {
      this._gain = gain;
    }
    const startGain = fadeDuration > 0 ? 0 : this._gain;
    const endGain = this._gain;
    if (this._loop) {
      const loopingInstance = this._instances.find(
        (instance) => instance.sourceNode.loop
      );
      if (
        loopingInstance &&
        (!loopingInstance.willDisconnect || when === loopingInstance.stoppedAt)
      ) {
        this._fade(loopingInstance, when, endGain, fadeDuration);
        return loopingInstance;
      }
    }
    const instance = this._play(when, startGain, offset, duration);
    instance.startedAt = when;
    instance.pausedAt = 0;
    this._fade(instance, when, endGain, fadeDuration);
    return instance;
  }

  stop(when = 0, fadeDuration = DEFAULT_FADE_DURATION): AudioInstance[] {
    for (const instance of this._instances) {
      instance.stoppedAt = when;
      this._fade(instance, when, 0, fadeDuration, true, true);
    }
    return [...this._instances];
  }

  fade(
    when: number,
    fadeDuration = DEFAULT_FADE_DURATION,
    gain?: number
  ): AudioInstance[] {
    if (gain != null) {
      this._gain = gain;
    }
    for (const instance of this._instances) {
      this._fade(instance, when, this._gain, fadeDuration, false);
    }
    return [...this._instances];
  }

  pause(when: number, fadeDuration = DEFAULT_FADE_DURATION): AudioInstance[] {
    for (const instance of this._instances) {
      this._fade(instance, when, 0, fadeDuration);
      instance.sourceNode.stop(when + fadeDuration);
      instance.pausedAt = when + fadeDuration;
    }
    return [...this._instances];
  }

  unpause(when: number, fadeDuration = DEFAULT_FADE_DURATION): AudioInstance[] {
    for (const instance of this._instances) {
      if (instance.pausedAt != null) {
        const offset = instance.startedAt - instance.pausedAt;
        instance.pausedAt = undefined;
        instance.sourceNode.start(0, offset);
        this._fade(instance, when, this._gain, fadeDuration);
      }
    }
    return [...this._instances];
  }

  step(when: number, deltaSeconds: number): AudioInstance {
    this.stop();
    return this.start(when, 0, undefined, when + deltaSeconds);
  }

  getStartTime() {
    return this._instances[0]?.startedAt ?? this._audioContext.currentTime;
  }

  getCurrentOffset(from: number) {
    const startedAt = this.getStartTime();
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
    const startedAt = this.getStartTime();
    return startedAt + this.getNextCueOffset(from);
  }
}
