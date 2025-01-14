export default class AudioMixer {
  protected _audioContext: AudioContext;
  public get context(): AudioContext {
    return this._audioContext;
  }

  protected _volumeNode: GainNode;
  public get volumeNode(): GainNode {
    return this._volumeNode;
  }

  protected _gain = 1;
  public get gain() {
    return this._gain;
  }
  public set gain(value: number) {
    this._gain = value;
    this._volumeNode.gain.value = value;
  }

  constructor(audioContext: AudioContext, destination?: AudioNode) {
    this._audioContext = audioContext;
    this._volumeNode = this._audioContext.createGain();
    this._volumeNode.connect(destination ?? this._audioContext.destination);
  }
}
