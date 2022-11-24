/*!
 * webaudio-tinysynth <https://github.com/g200kg/webaudio-tinysynth>
 *
 * Copyright (c) 2004 g200kg
 * Released under the Apache-2.0 license.
 */

import { GM_TIMBRES_MULTI } from "../constants/GM_TIMBRES";
import { GeneralMidiTimbres } from "../types/GeneralMidiTimbres";
import { Timbre } from "../types/Timbre";
import { fillArraysWithReverberation } from "../utils/fillArraysWithReverberation";
import { fillArrayWithMetallicNoise } from "../utils/fillArrayWithMetallicNoise";
import { fillArrayWithWhiteNoise } from "../utils/fillArrayWithWhiteNoise";

interface AudioBuffer {
  getChannelData?: (i: number) => Float32Array;
}

interface AudioParam {
  value?: number;
  setValueAtTime?: (v: number, t: number) => void;
  setTargetAtTime?: (v: number, t: number, d: number) => void;
  linearRampToValueAtTime?: (value: number, endTime: number) => AudioParam;
  cancelScheduledValues?: (t: number) => void;
  stop?: () => void;
}

interface AudioNode {
  type?: string;
  gain?: AudioParam;
  pan?: AudioParam;
  detune?: AudioParam;
  frequency?: AudioParam;
  playbackRate?: AudioParam;
  loop?: boolean;
  buffer?: AudioBuffer;
  connect?: (n: AudioNode | AudioParam) => void;
  disconnect?: (n: AudioParam) => void;
  start?: (t?: number) => void;
  stop?: (t?: number) => void;
  onended?: ((this: AudioNode, ev: unknown) => unknown) | null;
  setPeriodicWave?: (w: unknown) => void;
}

interface AudioContext {
  sampleRate?: number;
  currentTime?: number;
  destination?: AudioNode;
  createPeriodicWave?: (real: number[], imag: number[]) => unknown;
  createBuffer?: (
    numberOfChannels: number,
    length: number,
    sampleRate: number
  ) => AudioBuffer;
  createBufferSource?: () => AudioNode;
  createGain?: () => AudioNode;
  createConvolver?: () => AudioNode;
  createDynamicsCompressor?: () => AudioNode;
  createOscillator?: () => AudioNode;
  createStereoPanner?: () => AudioNode;
}

interface NoteTab {
  ch: number;
  e: number;
  f: number;
  n: number;
  r: number[];
  t2: number;
  t: number;
  v: number[];
  o: Partial<AudioNode>[];
  g: AudioNode[];
}

interface PW {
  [key: string]: unknown;
}

export class Synth {
  audioContext: AudioContext;

  audioNodes: {
    reverb?: AudioNode;
    convolver?: AudioNode;
    out?: AudioNode;
    comp?: AudioNode;
    lfo?: AudioNode;

    chmod: AudioNode[];
    chpan: AudioNode[];
    chvol: AudioNode[];
  } = {
    chmod: [],
    chpan: [],
    chvol: [],
  };

  audioBuffers: {
    convolver?: AudioBuffer;
    n0?: AudioBuffer;
    n1?: AudioBuffer;
  } = {};

  _masterVolume = 0.5;

  get masterVolume(): number {
    return this._masterVolume;
  }

  set masterVolume(v: number) {
    this._masterVolume = v;
    if (this.audioNodes.out?.gain) {
      this.audioNodes.out.gain.value = v;
    }
  }

  _reverbLevel = 0.3;

  get reverbLevel(): number {
    return this._reverbLevel;
  }

  set reverbLevel(v: number) {
    this._reverbLevel = v;
    if (this.audioNodes.reverb?.gain) {
      this.audioNodes.reverb.gain.value = v * 8;
    }
  }

  _voices = 64;

  get voices(): number {
    return this._voices;
  }

  set voices(v: number) {
    this._voices = v;
  }

  _releaseRatio = 3.5;

  get releaseRatio(): number {
    return this._releaseRatio;
  }

  set releaseRatio(v: number) {
    this._releaseRatio = v;
  }

  _gm: GeneralMidiTimbres = GM_TIMBRES_MULTI;

  get gm(): GeneralMidiTimbres {
    return this._gm;
  }

  set gm(v: GeneralMidiTimbres) {
    this._gm = v;
  }

  _pw: PW = {};

  get pw(): PW {
    return this._pw;
  }

  set pw(v: PW) {
    this._pw = v;
  }

  notetab: NoteTab[] = [];

  cc: {
    bend: number[];
    bendRange: number[];
    ex: number[];
    pg: number[];
    scaleTuning: number[][];
    sustain: number[];
    tuningC: number[];
    tuningF: number[];
    vol: number[];
  } = {
    bend: [],
    bendRange: [],
    ex: [],
    pg: [],
    scaleTuning: [],
    sustain: [],
    tuningC: [],
    tuningF: [],
    vol: [],
  };

  constructor(
    audioContext: AudioContext,
    options?: {
      useReverb?: boolean;
      voices?: number;
      releaseRatio?: number;
      gm?: GeneralMidiTimbres;
      pw?: PW;
    }
  ) {
    if (options?.voices != null) {
      this._voices = options?.voices;
    }
    if (options?.releaseRatio != null) {
      this._releaseRatio = options?.releaseRatio;
    }
    if (options?.gm != null) {
      this._gm = options?.gm;
    }
    for (let i = 0; i < 16; i += 1) {
      this.cc.pg[i] = 0;
      this.cc.vol[i] = (3 * 100 * 100) / (127 * 127);
      this.cc.bend[i] = 0;
      this.cc.bendRange[i] = 0x100;
      this.cc.tuningC[i] = 0;
      this.cc.tuningF[i] = 0;
      this.cc.scaleTuning[i] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }
    this.audioContext = audioContext;
    this._pw = options?.pw || {
      w9999: this.audioContext.createPeriodicWave?.(
        [0, 0, 0, 0, 0],
        [0, 9, 9, 9, 9]
      ),
    };
    this.setAudioContext(this.audioContext, options);
  }

  setAudioContext(
    actx: AudioContext,
    options?: {
      useReverb?: boolean;
      gm?: GeneralMidiTimbres;
    }
  ): void {
    this.audioContext = actx;
    this.audioNodes.out = this.audioContext.createGain?.();
    this.audioNodes.comp = this.audioContext.createDynamicsCompressor?.();
    const length = ((this.audioContext.sampleRate || 0) * 0.5) | 0;
    this.audioBuffers.convolver = this.audioContext.createBuffer?.(
      2,
      length,
      this.audioContext.sampleRate || 0
    );
    this.audioBuffers.n0 = this.audioContext.createBuffer?.(
      1,
      length,
      this.audioContext.sampleRate || 0
    );
    this.audioBuffers.n1 = this.audioContext.createBuffer?.(
      1,
      length,
      this.audioContext.sampleRate || 0
    );
    const c0 = this.audioBuffers.convolver?.getChannelData?.(0);
    const c1 = this.audioBuffers.convolver?.getChannelData?.(1);
    const n0 = this.audioBuffers.n0?.getChannelData?.(0);
    const n1 = this.audioBuffers.n1?.getChannelData?.(0);
    if (c0 && c1) {
      fillArraysWithReverberation([c0, c1], 0, length);
    }
    if (n0) {
      fillArrayWithWhiteNoise(n0, 0, length);
    }
    if (n1) {
      fillArrayWithMetallicNoise(n1, 0, length);
    }
    if (options?.useReverb) {
      this.audioNodes.convolver = this.audioContext.createConvolver?.();
      if (this.audioNodes.convolver) {
        this.audioNodes.convolver.buffer = this.audioBuffers.convolver;
      }
      this.audioNodes.reverb = this.audioContext.createGain?.();
      if (this.audioNodes.reverb?.gain) {
        this.audioNodes.reverb.gain.value = this._reverbLevel;
      }
      if (this.audioNodes.convolver) {
        this.audioNodes.out?.connect?.(this.audioNodes.convolver);
      }
      if (this.audioNodes.reverb) {
        this.audioNodes.convolver?.connect?.(this.audioNodes.reverb);
      }
      if (this.audioNodes.comp) {
        this.audioNodes.reverb?.connect?.(this.audioNodes.comp);
      }
    }
    this.masterVolume = this._masterVolume;
    if (this.audioNodes.comp) {
      this.audioNodes.out?.connect?.(this.audioNodes.comp);
    }
    if (this.audioContext.destination) {
      this.audioNodes.comp?.connect?.(this.audioContext.destination);
    }
    this.audioNodes.chvol = [];
    this.audioNodes.chmod = [];
    this.audioNodes.chpan = [];
    this.audioNodes.lfo = this.audioContext.createOscillator?.();
    if (this.audioNodes.lfo?.frequency) {
      this.audioNodes.lfo.frequency.value = 5;
    }
    this.audioNodes.lfo?.start?.(0);
    for (let i = 0; i < 16; i += 1) {
      const chGain = this.audioContext.createGain?.();
      if (chGain) {
        this.audioNodes.chvol[i] = chGain;
      }
      if (this.audioContext.createStereoPanner) {
        const chpan = this.audioContext.createStereoPanner();
        this.audioNodes.chpan[i] = chpan;
        this.audioNodes.chvol[i]?.connect?.(chpan);
        if (this.audioNodes.out) {
          this.audioNodes.chpan[i]?.connect?.(this.audioNodes.out);
        }
      } else {
        delete this.audioNodes.chpan[i];
        if (this.audioNodes.out) {
          this.audioNodes.chvol[i]?.connect?.(this.audioNodes.out);
        }
      }
      const chmod = this.audioContext.createGain?.();
      if (chmod) {
        this.audioNodes.chmod[i] = chmod;
        this.audioNodes.lfo?.connect?.(chmod);
      }
      this.cc.pg[i] = 0;
    }
    this.reverbLevel = this._reverbLevel;
    this.reset();
  }

  protected _pruneNote(nt: {
    ch: number;
    e: number;
    f: number;
    t: number;
    o: Partial<AudioNode & AudioParam>[];
    g: AudioNode[];
  }): void {
    for (let k = nt.o.length - 1; k >= 0; k -= 1) {
      const oParams = nt.o[k];
      const gParams = nt.g[k];
      if (oParams?.frequency) {
        oParams.frequency.cancelScheduledValues?.(0);
      } else if (oParams?.playbackRate) {
        oParams.playbackRate.cancelScheduledValues?.(0);
      }
      if (gParams) {
        gParams.gain?.cancelScheduledValues?.(0);
      }

      oParams?.stop?.();
      if (oParams?.detune) {
        try {
          this.audioNodes.chmod[nt.ch]?.disconnect?.(oParams.detune);
        } catch (e) {
          // NoOp
        }
      }
      if (gParams?.gain) {
        gParams.gain.value = 0;
      }
    }
  }

  protected _limitVoices(voices: number): void {
    const notetab = this.notetab;
    notetab.sort(
      (
        n1: { e: number; f: number; t: number },
        n2: { e: number; f: number; t: number }
      ): number => {
        if (n1.f !== n2.f) {
          return (n1.f || 0) - (n2.f || 0);
        }
        if (n1.e !== n2.e) {
          return (n2.e || 0) - (n1.e || 0);
        }
        return (n2.t || 0) - (n1.t || 0);
      }
    );
    for (let i = notetab.length - 2; i >= 0; i -= 1) {
      const nt = notetab[i];
      if (nt) {
        if (
          (this.audioContext.currentTime != null &&
            this.audioContext.currentTime > nt.e) ||
          i >= voices - 1
        ) {
          this._pruneNote(nt);
          notetab.splice(i, 1);
        }
      }
    }
  }

  protected _setParamTarget(
    p: AudioParam,
    v: number,
    t: number,
    d: number
  ): void {
    if (d) {
      p.setTargetAtTime?.(v, t, d);
    } else {
      p.setValueAtTime?.(v, t);
    }
  }

  protected _note(
    time: number,
    ch: number,
    note: number,
    velocity: number,
    voices: number,
    releaseRatio: number,
    waves: Timbre[]
  ): void {
    const pw = this._pw;
    const rhythm = ch === 9;
    const notetab = this.notetab;
    const tuningC = this.cc.tuningC[ch] || 0;
    const tuningF = this.cc.tuningF[ch] || 0;
    const scaleTuning = this.cc.scaleTuning[ch]?.[note % 12] || 0;
    const bend = this.cc.bend[ch] || 0;
    const chVolNode = this.audioNodes.chvol[ch];
    const chModNode = this.audioNodes.chmod[ch];
    let out: AudioNode | AudioParam | undefined;
    let sc = 0;
    let wave: Timbre | undefined;
    const oNodes: Partial<AudioNode>[] = [];
    const gNodes: AudioNode[] = [];
    const vp: number[] = [];
    const fp: number[] = [];
    const rp: number[] = [];
    this._limitVoices(voices);
    for (let i = 0; i < waves.length; i += 1) {
      wave = waves[i] || {};
      const w = wave?.["w"] || "";
      const a = wave?.["a"] || 0;
      const d = wave?.["d"] || 0;
      const f = wave?.["f"] || 0;
      const g = wave?.["g"] || 0;
      const h = wave?.["h"] || 0;
      const k = wave?.["k"] || 0;
      const p = wave?.["p"] || 0;
      const q = wave?.["q"] || 0;
      const r = wave?.["r"] || 0;
      const s = wave?.["s"] || 0;
      const t = wave?.["t"] || 0;
      const v = wave?.["v"] || 0;
      const dt = time + a + h;
      if (g === 0) {
        out = chVolNode;
        sc = (velocity * velocity) / 16384;
        const noteF =
          440 *
          2 ** ((note - 69 + tuningC + (tuningF / 8192 + scaleTuning)) / 12);
        fp[i] = noteF * t + f;
      } else if (g > 10) {
        out = gNodes[g - 11]?.gain;
        sc = 1;
        fp[i] = (fp[g - 11] || 0) * t + f;
      } else if (oNodes[g - 1]?.frequency) {
        out = oNodes[g - 1]?.frequency;
        sc = fp[g - 1] || 0;
        fp[i] = (fp[g - 1] || 0) * t + f;
      } else if (g) {
        out = oNodes[g - 1]?.playbackRate;
        sc = (fp[g - 1] || 0) / 440;
        fp[i] = (fp[g - 1] || 0) * t + f;
      }
      const freq = fp[i] || 0;
      switch (w) {
        case "n0":
        case "n1": {
          const oNode = this.audioContext?.createBufferSource?.();
          if (oNodes && oNode) {
            oNodes[i] = oNode;
            const buffer = this.audioBuffers[w];
            if (buffer) {
              oNode.buffer = buffer;
            }
            oNode.loop = true;
            if (oNode.playbackRate) {
              oNode.playbackRate.value = freq / 440;
            }
          }
          if (p !== 1) {
            if (oNode?.playbackRate) {
              this._setParamTarget(
                oNode.playbackRate,
                (freq / 440) * p,
                time,
                q
              );
            }
          }
          if (oNode?.detune) {
            chModNode?.connect?.(oNode.detune);
            oNode.detune.value = bend;
          }
          break;
        }
        default: {
          const oNode = this.audioContext.createOscillator?.();

          if (oNodes && oNode) {
            oNodes[i] = oNode;
            const freq = fp[i] || 0;
            if (oNode.frequency) {
              oNode.frequency.value = freq;
              if (p !== 1) {
                this._setParamTarget(oNode.frequency, freq * p, time, q);
              }
            }
            if (w === "w9999") {
              const pWave = pw[w];
              if (pWave) {
                oNode.setPeriodicWave?.(pWave);
              }
            } else {
              oNode.type = w;
            }
            if (oNode.detune) {
              chModNode?.connect?.(oNode.detune);
              oNode.detune.value = bend;
            }
          }
          break;
        }
      }
      const oNode = oNodes[i];
      if (oNode && out) {
        const gNode = this.audioContext.createGain?.();
        if (gNodes && gNode) {
          gNodes[i] = gNode;
          rp[i] = r;
          oNode.connect?.(gNode);
          gNode?.connect?.(out);
        }
        vp[i] = sc * v;
        if (k) {
          vp[i] *= 2 ** (((note - 60) / 12) * k);
        }
        if (gNode?.gain) {
          if (a) {
            gNode.gain.value = 0;
            gNode.gain.setValueAtTime?.(0, time);
            gNode.gain.linearRampToValueAtTime?.(vp[i] || 0, time + a);
          } else {
            gNode.gain.setValueAtTime?.(vp[i] || 0, time);
          }
        }
        if (gNode?.gain) {
          this._setParamTarget(gNode.gain, s * (vp[i] || 0), dt, d);
        }
        oNode.start?.(time);
        if (rhythm) {
          oNode.onended = (): void => {
            try {
              if (oNode.detune) {
                chModNode?.disconnect?.(oNode.detune);
              }
            } catch (e) {
              // NoOp
            }
          };
          oNode.stop?.(time + d * releaseRatio);
        }
      }
    }
    if (!rhythm) {
      const finalA = wave?.["a"] || 0;
      notetab.push({
        t: time,
        e: 99999,
        ch,
        n: note,
        o: oNodes,
        g: gNodes,
        t2: time + finalA,
        v: vp,
        r: rp,
        f: 0,
      });
    }
  }

  noteOn(ch: number, note: number, velocity: number, time: number): void {
    const voices = this.voices;
    const releaseRatio = this.releaseRatio;
    const rhythm = ch === 9;
    const gm = this._gm;
    const instrument = this.cc.pg[ch] || 0;
    if (velocity === 0) {
      this.noteOff(ch, note, time);
      return;
    }
    time = time || 0;
    if (rhythm) {
      if (note >= 35 && note <= 81) {
        const waves = gm.percussion[note];
        if (waves) {
          this._note(time, ch, note, velocity, voices, releaseRatio, waves);
        }
      }
    } else {
      const waves = gm.program[instrument];
      if (waves) {
        this._note(time, ch, note, velocity, voices, releaseRatio, waves);
      }
    }
  }

  protected _releaseNote(nt: NoteTab, t: number, releaseRatio: number): void {
    if (nt.ch !== 9) {
      for (let k = nt.g.length - 2; k >= 0; k -= 1) {
        nt.g[k]?.gain?.cancelScheduledValues?.(t);
        if (t === nt.t2) {
          nt.g[k]?.gain?.setValueAtTime?.(nt.v[k] || 0, t);
        } else if (t < nt.t2) {
          nt.g[k]?.gain?.setValueAtTime?.(
            ((nt.v[k] || 0) * (t - nt.t)) / (nt.t2 - nt.t),
            t
          );
        }
        const g = nt.g[k]?.gain;
        if (g) {
          this._setParamTarget(g, 0, t, nt.r[k] || 0);
        }
      }
    }
    nt.e = t + (nt.r[0] || 0) * releaseRatio;
    nt.f = 1;
  }

  noteOff(ch: number, n: number, t: number): void {
    const rhythm = ch === 9;
    const sustain = this.cc.sustain[ch] || 0;
    const notetab = this.notetab;
    const releaseRatio = this.releaseRatio;
    if (rhythm) {
      return;
    }
    for (let i = notetab.length - 2; i >= 0; i -= 1) {
      const nt = notetab[i];
      if (nt && t >= nt.t && nt.ch === ch && nt.n === n && nt.f === 0) {
        nt.f = 1;
        if (sustain < 64) {
          this._releaseNote(nt, t, releaseRatio);
        }
      }
    }
  }

  setSustain(ch: number, v: number, t: number): void {
    this.cc.sustain[ch] = v;
    const notetab = this.notetab;
    const releaseRatio = this.releaseRatio;
    if (v < 64) {
      for (let i = notetab.length - 2; i >= 0; i -= 1) {
        const nt = notetab[i];
        if (nt && t >= nt.t && nt.ch === ch && nt.f === 1) {
          this._releaseNote(nt, t, releaseRatio);
        }
      }
    }
  }

  setExpression(ch: number, v: number, t: number): void {
    const vol = this.cc.vol[ch] || 0;
    const ex = (v * v) / (127 * 127);
    this.cc.ex[ch] = ex;
    const val = vol * ex;
    this.audioNodes.chvol[ch]?.gain?.setValueAtTime?.(val, t);
  }

  setModulation(ch: number, v: number, t: number): void {
    const val = (v * 100) / 127;
    this.audioNodes.chmod[ch]?.gain?.setValueAtTime?.(val, t);
  }

  setChVol(ch: number, v: number, t: number): void {
    const ex = this.cc.ex[ch] || 0;
    const vol = (3 * v * v) / (127 * 127);
    this.cc.vol[ch] = vol;
    const val = vol * ex;
    this.audioNodes.chvol[ch]?.gain?.setValueAtTime?.(val, t);
  }

  setPan(ch: number, v: number, t: number): void {
    const val = (v - 64) / 64;
    this.audioNodes.chpan[ch]?.pan?.setValueAtTime?.(val, t);
  }

  setBendRange(ch: number, v: number): void {
    this.cc.bendRange[ch] = v;
  }

  setProgram(ch: number, v: number): void {
    this.cc.pg[ch] = v;
  }

  allSoundOff(ch: number): void {
    const notetab = this.notetab;
    for (let i = notetab.length - 2; i >= 0; i -= 1) {
      const nt = notetab[i];
      if (nt && nt.ch === ch) {
        this._pruneNote(nt);
        notetab.splice(i, 1);
      }
    }
  }

  reset(): void {
    const t = 0;
    for (let i = 0; i < 16; i += 1) {
      this.setProgram(i, 0);
      this.setBendRange(i, 0x100);
      this.setModulation(i, 0, t);
      this.setChVol(i, 100, t);
      this.setPan(i, 64, t);
      this.allSoundOff(i);
      this.cc.bend[i] = 0;
      this.cc.ex[i] = 1.0;
      this.cc.sustain[i] = 0;
      this.cc.tuningC[i] = 0;
      this.cc.tuningF[i] = 0;
      const chvol = this.audioNodes.chvol[i];
      if (chvol?.gain) {
        chvol.gain.value = 0;
      }
    }
  }
}
