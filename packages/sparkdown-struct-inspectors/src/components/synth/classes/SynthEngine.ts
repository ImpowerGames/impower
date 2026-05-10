import { type Synth } from "@impower/spark-engine/src/game/modules/audio/types/Synth";
import {
  DISTORTION_EDGE_MULTIPLIER,
  getDuration,
  PITCH_SEMITONES_MULTIPLIER,
  synthesizeSound,
} from "@impower/spark-engine/src/game/modules/audio/utils/synthesizeSound";

export interface Buffers {
  soundBuffer: Float32Array;
  volumeBuffer: Float32Array;
  pitchBuffer: Float32Array;
  pitchRange: [number, number];
  referenceBuffer?: Float32Array;
}

export class SynthEngine {
  static audioCtx: AudioContext | null = null;
  static activeSource: AudioBufferSourceNode | null = null;
  static activeGain: GainNode | null = null;
  static sampleRate = new AudioContext().sampleRate;
  static pitchSemitonesMultiplier = PITCH_SEMITONES_MULTIPLIER;
  static distortionEdgeMultiplier = DISTORTION_EDGE_MULTIPLIER;

  static getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === "suspended") this.audioCtx.resume();
    return this.audioCtx;
  }

  static getDuration(synth: Synth): number {
    return getDuration(synth, this.sampleRate);
  }

  static generateBuffers(synth: Synth): Buffers {
    // We add 0.5 seconds as a fixed "sustain" duration exactly like the previous logic to give it a bound.
    const totalDuration = this.getDuration(synth);
    const maxSamples = Math.floor(totalDuration * this.sampleRate);

    const soundBuffer = new Float32Array(maxSamples);
    const volumeBuffer = new Float32Array(maxSamples);
    const pitchBuffer = new Float32Array(maxSamples);
    const pitchRange: [number, number] = [
      Number.MAX_SAFE_INTEGER,
      -Number.MAX_SAFE_INTEGER,
    ];

    synthesizeSound(
      synth,
      false,
      false,
      this.sampleRate,
      0,
      maxSamples,
      soundBuffer,
      volumeBuffer,
      pitchBuffer,
      pitchRange,
      synth.volume,
    );

    if (pitchRange[0] === Number.MAX_SAFE_INTEGER) {
      pitchRange[0] = 0;
      pitchRange[1] = 1;
    }

    // Truncate silence at the end for optimization
    let actualLength = maxSamples;
    for (let i = maxSamples - 1; i >= 0; i--) {
      if (Math.abs(soundBuffer[i]) > 0.001 || volumeBuffer[i] > 0.001) {
        actualLength = Math.min(maxSamples, i + 100);
        break;
      }
    }

    return {
      soundBuffer: soundBuffer.slice(0, actualLength),
      volumeBuffer: volumeBuffer.slice(0, actualLength),
      pitchBuffer: pitchBuffer.slice(0, actualLength),
      pitchRange,
    };
  }

  static playSynth(synth: Synth): void {
    const ctx = this.getAudioContext();
    const { soundBuffer } = this.generateBuffers(synth);

    if (soundBuffer.length === 0) return;

    // We've removed the redundant hard stop here.
    // Let playBuffer handle transitions smoothly.

    const buffer = ctx.createBuffer(1, soundBuffer.length, ctx.sampleRate);
    buffer.getChannelData(0).set(soundBuffer);

    this.playBuffer(buffer);
  }

  static playBuffer(buffer: AudioBuffer): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const fadeDuration = 0.015; // Fade to prevent clicks

    // 1. Smoothly fade out the previous source
    if (this.activeSource && this.activeGain) {
      try {
        const oldSource = this.activeSource;
        const oldGain = this.activeGain;

        // Anchor current value and cancel any future scheduled changes
        oldGain.gain.cancelScheduledValues(now);
        oldGain.gain.setValueAtTime(oldGain.gain.value, now);

        // Ramp volume down to 0 over 20ms
        oldGain.gain.linearRampToValueAtTime(0, now + fadeDuration);

        // Stop the source *after* the fade-out completes
        oldSource.stop(now + fadeDuration);
      } catch (e) {
        console.warn("Failed to stop previous node cleanly", e);
      }
    }

    // 2. Create the new source and its own gain node
    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();

    source.buffer = buffer;

    // Connect Source -> Gain -> Destination
    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    // 3. Smoothly fade in the new source to prevent start pops
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(1, now + fadeDuration);

    source.start(now);

    // 4. Store references for the next time this is called
    this.activeSource = source;
    this.activeGain = gainNode;
  }

  static encodeWAV(samples: Float32Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeString = (v: DataView, offset: number, str: string) => {
      for (let i = 0; i < str.length; i++)
        v.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([view], { type: "audio/wav" });
  }
}
