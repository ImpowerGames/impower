const DEFAULT_FADE_DURATION = 0.016;

type AudioListener = (
  this: AudioBufferSourceNode,
  ev: AudioScheduledSourceNodeEventMap[keyof AudioScheduledSourceNodeEventMap]
) => any;

interface AudioNode {
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
  startedAt: number;
  pausedAt?: number;
}

export default class AudioPlayer {
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

  protected _nodes: AudioNode[] = [];

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

  protected _destination?: GainNode | AudioNode | AudioParam;

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
      destination?: GainNode | AudioNode | AudioParam;
      cues?: number[];
      loop?: boolean;
      volume?: number;
    }
  ) {
    this._audioBuffer = audioBuffer;
    this._audioContext = audioContext;
    this._destination = options?.destination;
    this._cues = options?.cues ?? this._cues;
    this._loop = options?.loop ?? this._loop;
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
    this._nodes.forEach((node) => {
      node.sourceNode.removeEventListener("ended", listener, options);
    });
  }

  secondsToApproximateTimeConstant(sec: number = 0) {
    return (sec * 2) / 10;
  }

  dispose() {
    [...this._nodes].forEach((node) => this._disconnect(node));
  }

  protected _disconnect(node: AudioNode) {
    node.sourceNode.stop(0);
    node.sourceNode.disconnect();
    const nodeIndex = this._nodes.indexOf(node);
    if (nodeIndex >= 0) {
      this._nodes.splice(nodeIndex, 1);
    }
  }

  protected _play(
    when: number = 0,
    offset?: number,
    duration?: number,
    gain?: number
  ): AudioNode {
    const gainNode = this._audioContext.createGain();
    if (gain != null) {
      gainNode.gain.value = gain;
    }
    const sourceNode = this._audioContext.createBufferSource();
    const node: AudioNode = {
      gainNode: gainNode,
      sourceNode: sourceNode,
      startedAt: when,
    };
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
        this._disconnect(node);
      },
      { once: true }
    );
    this._events.ended.forEach((options, listener) => {
      sourceNode.addEventListener("ended", listener, options);
    });
    sourceNode.connect(gainNode);
    sourceNode.start(when, offset, duration);
    this._nodes.push(node);
    return node;
  }

  protected async _fadeAsync(
    node: AudioNode,
    when: number,
    value: number,
    duration?: number
  ): Promise<number> {
    node.gainNode.gain.setTargetAtTime(
      value,
      when,
      this.secondsToApproximateTimeConstant(duration)
    );
    return new Promise<number>((resolve) => {
      let startTime = performance.now();
      if (duration) {
        const awaitFade = () => {
          if (performance.now() < startTime + duration + 0.001) {
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
    node: AudioNode,
    when = 0,
    fadeDuration = DEFAULT_FADE_DURATION
  ): Promise<number> {
    const stoppedAt = await this._fadeAsync(node, when, 0, fadeDuration);
    // Disconnect node after finished fading out so it can be garbage collected
    this._disconnect(node);
    return stoppedAt;
  }

  async start(
    when: number = 0,
    fadeDuration = 0,
    offset?: number,
    duration?: number,
    gain?: number
  ): Promise<AudioNode> {
    this._gain = gain ?? 1;
    const startGain = fadeDuration > 0 ? 0 : this._gain;
    const endGain = this._gain;
    const loopingNode = this._nodes.find((node) => node.sourceNode.loop);
    if (loopingNode && this._loop) {
      await this._fadeAsync(loopingNode, when, endGain, fadeDuration);
      return loopingNode;
    }
    const node = this._play(when, offset, duration, startGain);
    node.startedAt = when;
    node.pausedAt = 0;
    await this._fadeAsync(node, when, endGain, fadeDuration);
    return node;
  }

  async stop(
    when = 0,
    fadeDuration = DEFAULT_FADE_DURATION
  ): Promise<number[]> {
    return Promise.all(
      [...this._nodes].map((node) => this._stopAsync(node, when, fadeDuration))
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
      this._nodes.map((node) =>
        this._fadeAsync(node, when, this._gain, fadeDuration)
      )
    );
  }

  async pause(
    when: number,
    fadeDuration = DEFAULT_FADE_DURATION
  ): Promise<number[]> {
    return Promise.all(
      this._nodes.map(async (node) => {
        const fadedOutAt = await this._fadeAsync(node, when, 0, fadeDuration);
        node.sourceNode.stop(0);
        node.pausedAt = fadedOutAt;
        return fadedOutAt;
      })
    );
  }

  async unpause(
    when: number,
    fadeDuration = DEFAULT_FADE_DURATION
  ): Promise<number[]> {
    return Promise.all(
      this._nodes.map(async (node) => {
        if (node.pausedAt != null) {
          const offset = node.startedAt - node.pausedAt;
          node.pausedAt = undefined;
          node.sourceNode.start(0, offset);
          const fadedInAt = await this._fadeAsync(
            node,
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
    return this._nodes[0]?.startedAt ?? this._audioContext.currentTime;
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
