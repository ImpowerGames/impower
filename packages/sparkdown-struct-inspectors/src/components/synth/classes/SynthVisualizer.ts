import { type OscillatorType } from "@impower/spark-engine/src/game/modules/audio/types/OscillatorType";
import { type Direction } from "@impower/spark-engine/src/game/modules/audio/types/Synth";
import {
  choose,
  getCycleIndex,
  getOctaveSemitones,
  isChoicesReversed,
  OSCILLATORS,
  OscillatorState,
  PI2,
  randomizer,
  unlerp,
} from "@impower/spark-engine/src/game/modules/audio/utils/synthesizeSound";
import { SynthEngine, type Buffers } from "./SynthEngine";

export class SynthVisualizer {
  static getPreviewLFO(
    shape: OscillatorType,
    phase: number,
    state?: OscillatorState,
  ): number {
    const t = phase / PI2;
    if (OSCILLATORS[shape]) {
      return OSCILLATORS[shape](t, state);
    }
    return 0;
  }

  static clamp(x: number, min: number, max: number) {
    if (x < min) {
      return min;
    }
    if (x > max) {
      return max;
    }
    return x;
  }

  static lerp(t: number, a: number, b: number): number {
    t = SynthVisualizer.clamp(t, 0, 1);
    return a * (1 - t) + b * t;
  }

  static drawMainGraph(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    buffers: Buffers,
    viewStart: number = 0,
    viewEnd: number = 1,
    visibility: {
      shape?: boolean;
      volume?: boolean;
      pitch?: boolean;
      reference?: boolean;
    } = {
      shape: true,
      volume: true,
      pitch: true,
      reference: true,
    },
  ): void {
    const {
      soundBuffer,
      volumeBuffer,
      pitchBuffer,
      pitchRange,
      referenceBuffer,
    } = buffers;

    const [pMin, pMax] = pitchRange;

    const bufferLength = soundBuffer.length;
    if (bufferLength === 0) return;

    const startIndex = Math.floor(viewStart * (bufferLength - 1));
    const endIndex = Math.floor(viewEnd * (bufferLength - 1));
    const visibleLength = Math.max(1, endIndex - startIndex);

    const startY = height / 2;

    // Smart pixel mapper: Interpolates when zoomed in, extracts min/max bounds when zoomed out
    const getAudioPixel = (buffer: Float32Array | number[], x: number) => {
      const exactIndex = startIndex + (x / width) * visibleLength;

      if (visibleLength <= width) {
        // Zoomed In: Smooth linear interpolation between individual samples
        const i0 = Math.floor(exactIndex);
        const i1 = Math.min(bufferLength - 1, i0 + 1);
        const t = exactIndex - i0;
        const val = buffer[i0]! * (1 - t) + buffer[i1]! * t;
        return { min: val, max: val, avg: val };
      }

      // Zoomed Out: Min/Max grouping to prevent audio-rate aliasing
      let startI = Math.min(bufferLength - 1, Math.floor(exactIndex));
      let endI = Math.floor(startIndex + ((x + 1) / width) * visibleLength);
      if (endI <= startI) endI = startI + 1;
      endI = Math.min(bufferLength, endI);

      let min = buffer[startI] || 0;
      let max = min;
      let sum = 0;

      for (let i = startI; i < endI; i++) {
        const val = buffer[i]!;
        if (val < min) min = val;
        if (val > max) max = val;
        sum += val;
      }
      return { min, max, avg: sum / (endI - startI) };
    };

    // Draw Dashed Baseline
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#404040";
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, startY);
    ctx.lineTo(width, startY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Pitch
    const PITCH_HEIGHT_FACTOR = 2;
    if (visibility.pitch && pitchBuffer) {
      ctx.strokeStyle = "rgba(236, 72, 153, 0.5)";
      ctx.fillStyle = "rgba(236, 72, 153, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x < width; x++) {
        const { avg } = getAudioPixel(pitchBuffer, x);
        const mag = pMax === pMin ? 0.5 : (avg - pMin) / (pMax - pMin);
        ctx.lineTo(x, startY - mag * (height / PITCH_HEIGHT_FACTOR));
      }
      ctx.lineTo(width, height);
      ctx.fill();
      ctx.stroke();
    }

    // Draw Volume
    const VOLUME_HEIGHT_FACTOR = 2;
    if (visibility.volume && volumeBuffer) {
      ctx.strokeStyle = "rgba(245, 158, 11, 0.5)";
      ctx.fillStyle = "rgba(245, 158, 11, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x < width; x++) {
        const { max } = getAudioPixel(volumeBuffer, x);
        ctx.lineTo(x, startY - max * (height / VOLUME_HEIGHT_FACTOR));
      }
      ctx.lineTo(width, height);
      ctx.fill();
      ctx.stroke();
    }

    const drawWaveform = (
      buffer: Float32Array | number[],
      color: string,
      scaleY: number,
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let x = 0; x < width; x++) {
        const { avg } = getAudioPixel(buffer, x);
        const y = startY - avg * scaleY;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const SHAPE_HEIGHT_FACTOR = 2.5;
    if (visibility.reference && referenceBuffer) {
      drawWaveform(referenceBuffer, "#7f22fe", height / SHAPE_HEIGHT_FACTOR);
    }

    if (visibility.shape && soundBuffer) {
      drawWaveform(soundBuffer, "#0ea5e9", height / SHAPE_HEIGHT_FACTOR);
    }
  }

  static drawShape(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      shape?: OscillatorType;
      phase?: number;
      volume?: number;
      grit?: number;
      grit_ramp?: number;
      edge?: number;
      edge_ramp?: number;
      periods?: number;
    },
  ) {
    const {
      shape = "sine",
      phase = 0,
      volume = 1,
      grit = 0,
      grit_ramp = 0,
      edge = 0,
      edge_ramp = 0,
      periods = 6,
    } = params;

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#404040";
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = color;
    ctx.beginPath();

    const previewState = new OscillatorState(randomizer(0));

    const lengthInSamples = 1000;

    for (let i = 0; i <= lengthInSamples; i++) {
      const t_norm = i / lengthInSamples;

      // global_t represents the pure, stable phase (in cycles)
      const global_t = t_norm * periods;

      // Apply initial phase offset
      let runningAngle = global_t - phase;
      let warpedAngle = runningAngle;

      // 1. Calculate clamped Grit (prevents lerp from wrapping > 1.0)
      const currentGrit = grit + grit_ramp * t_norm;

      // 2. Phase Distortion
      if (currentGrit > 0) {
        // Assuming DISTORTION_GRIT_MIN = 1, DISTORTION_GRIT_MAX = 2
        const shortDistortionMod = SynthVisualizer.lerp(currentGrit, 1, 2);

        const W = 1.0 / shortDistortionMod;
        const baseCycle = Math.floor(runningAngle / 2.0) * 2.0;
        const x = runningAngle - baseCycle;

        if (x < W) {
          warpedAngle = baseCycle + x / W;
        } else {
          warpedAngle = baseCycle + 1.0 + (x - W) / (2.0 - W);
        }
      }

      // 3. Evaluate waveform using the warped angle
      let val = SynthVisualizer.getPreviewLFO(
        shape,
        warpedAngle * Math.PI * 2, // Convert cycles to radians for the LFO
        previewState,
      );

      // 4. Distortion Edge (Square-ness)
      const currentEdge = edge + edge_ramp * t_norm;
      if (currentEdge > 0) {
        const compressionFactor =
          1 / (1 + currentEdge * SynthEngine.distortionEdgeMultiplier);
        if (val > 0) {
          val = Math.pow(val, compressionFactor);
        } else {
          val = -Math.pow(-val, compressionFactor);
        }
      }

      const y = h / 2 - val * volume * (h * 0.4);
      if (i === 0) {
        ctx.moveTo(0, y);
      } else {
        ctx.lineTo(t_norm * w, y);
      }
    }
    ctx.stroke();
  }

  static drawEnvelope(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      offset: number;
      attack: number;
      decay: number;
      sustain: number;
      release: number;
      level: number;
    },
  ) {
    const {
      offset = 0,
      attack = 0,
      decay = 0,
      sustain = 0,
      release = 0,
      level = 1,
    } = params;

    const total = Math.max(offset + attack + decay + sustain + release, 0.001);

    const toX = (t: number) => (t / total) * w;
    const toY = (vol: number) => h - vol * h * 0.9;

    const x0 = 0;
    const delayEnd = toX(offset);
    const attackEnd = toX(offset + attack);
    const decayEnd = toX(offset + attack + decay);
    const sustainEnd = toX(offset + attack + decay + sustain);
    const releaseEnd = w;

    const yZero = toY(0); // silence
    const yPeak = toY(1); // always 1.0 at attack peak
    const ySustain = toY(level); // sustain level

    if (attack > 0 || decay > 0 || sustain > 0 || release > 0) {
      // Filled area
      ctx.fillStyle = `${color}20`;
      ctx.beginPath();
      ctx.moveTo(x0, h);
      ctx.moveTo(x0, yZero);
      ctx.moveTo(delayEnd, yZero); // delay: hold at 0
      ctx.lineTo(attackEnd, yPeak); // attack: ramp up to 1
      ctx.lineTo(decayEnd, ySustain); // decay: ramp down to level
      ctx.lineTo(sustainEnd, ySustain); // sustain: hold at level
      ctx.lineTo(releaseEnd, yZero); // release: ramp down to 0
      ctx.lineTo(releaseEnd, h);
      ctx.fill();

      // Stroke line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, yZero);
      ctx.moveTo(delayEnd, yZero);
      if (attack > 0 || decay > 0) {
        ctx.lineTo(attackEnd, yPeak);
      }
      ctx.lineTo(decayEnd, ySustain);
      ctx.lineTo(sustainEnd, ySustain);
      ctx.lineTo(releaseEnd, yZero);
      ctx.stroke();
    }
  }

  static drawPitch(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: any,
  ) {
    const {
      frequency,
      frequency_ramp,
      frequency_torque,
      frequency_jerk,
      sampleRate,
    } = params;

    const visibleDuration = 0.5;
    const lengthInSamples = Math.floor(visibleDuration * sampleRate);
    const step = 1;

    // Draw baseline
    ctx.strokeStyle = "#404040";
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Single pass: accumulate deltas and draw with a fixed vertical scale
    let freqSpeedPerSample = frequency_ramp / sampleRate;
    let freqAccelPerSample = frequency_torque / (sampleRate * sampleRate);
    let freqJerkPerSample =
      frequency_jerk / (sampleRate * sampleRate * sampleRate);
    let pitchFreqOffset = unlerp(frequency, 0, 40000);

    let pointIndex = 0;

    let lastX = 0;

    ctx.beginPath();

    for (let i = 0; i < lengthInSamples; i++) {
      if (i % step === 0) {
        // Offset is exactly 0 at i=0, forcing the first point to start at h/2
        const y = h / 2 - pitchFreqOffset * h;
        const x = (i / lengthInSamples) * w;

        if (pointIndex === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        lastX = x;
        pointIndex++;
      }

      freqAccelPerSample += freqJerkPerSample;
      freqSpeedPerSample += freqAccelPerSample;
      pitchFreqOffset += freqSpeedPerSample;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.lineTo(lastX, h); // Draw a line straight down to the bottom right
    ctx.lineTo(0, h); // Draw a line across to the bottom left
    ctx.fillStyle = `${color}20`;
    ctx.fill();
  }

  static drawFilter(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: any,
  ) {
    const { cutoff, cutoff_ramp, resonance, type } = params;
    const getX = (f: number) =>
      Math.max(0, Math.min(w, (w * Math.log(f / 20)) / Math.log(10000 / 20)));
    const getFillY = (x: number, xc: number, peakY: number) => {
      const d = (x - xc) / (w / 100);
      if (type === "lowpass")
        return d < -12
          ? h * 0.8
          : d <= 0
            ? h * 0.8 -
              (h * 0.8 - peakY) * Math.sin(((d + 12) / 12) * (Math.PI / 2))
            : d <= 15
              ? peakY + (h - peakY) * Math.sin((d / 15) * (Math.PI / 2))
              : h;
      return d < -15
        ? h
        : d <= 0
          ? peakY + (h - peakY) * Math.sin((-d / 15) * (Math.PI / 2))
          : d <= 12
            ? h * 0.8 -
              (h * 0.8 - peakY) * Math.sin(((12 - d) / 12) * (Math.PI / 2))
            : h * 0.8;
    };
    const xc = getX(cutoff),
      peakY = Math.max(5, h * 0.8 - (resonance || 0) * (h * 0.14));
    ctx.fillStyle = `${color}33`;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x++) ctx.lineTo(x, getFillY(x, xc, peakY));
    ctx.lineTo(w, h);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      const y = getFillY(x, xc, peakY);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (Math.abs(cutoff_ramp || 0) > 0.05) {
      const xcEnd = getX(
        Math.max(20, Math.min(10000, cutoff + (cutoff_ramp || 0) * 5000)),
      );
      ctx.setLineDash([2, 3]);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        const y = getFillY(x, xcEnd, peakY);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }
  }

  static drawLowpassFilter(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      on: boolean;
      cutoff: number;
      cutoff_ramp: number;
      resonance: number;
    },
  ) {
    SynthVisualizer.drawFilter(ctx, w, h, color, {
      ...params,
      type: "lowpass",
    });
  }

  static drawHighpassFilter(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      on: boolean;
      cutoff: number;
      cutoff_ramp: number;
    },
  ) {
    SynthVisualizer.drawFilter(ctx, w, h, color, {
      ...params,
      type: "highpass",
    });
  }

  static drawLFO(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      shape: OscillatorType;
      rate: number;
      rate_ramp: number;
      strength: number;
      strength_ramp: number;
    },
  ) {
    const { shape, rate, rate_ramp, strength, strength_ramp } = params;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#404040";
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = color;
    ctx.beginPath();

    const previewState = new OscillatorState(randomizer(0));

    const lengthInSamples = 1000;

    for (let i = 0; i <= lengthInSamples; i++) {
      const t = i / lengthInSamples,
        phase =
          ((rate || 0) * t + 0.5 * (rate_ramp || 0) * t * t) * Math.PI * 2;
      const y =
        h / 2 -
        SynthVisualizer.getPreviewLFO(shape, phase, previewState) *
          (Math.max(0, (strength || 0) + (strength_ramp || 0) * t) / 1) *
          (h * 0.5);
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(t * w, y);
    }
    ctx.stroke();
  }

  static drawArpeggio(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      type: "tones" | "levels" | "shapes" | "phases";
      shape: string;
      sampleRate: number;
      rate: number;
      rate_ramp: number;
      direction: Direction;
      max_octaves: number;
      max_notes: number;
      tones: number[];
      levels: number[];
      shapes: string[];
      phases: number[];
    },
  ) {
    const {
      type,
      shape,
      sampleRate,
      direction,
      max_octaves,
      max_notes,
      tones,
      levels,
      shapes,
      phases,
      rate,
      rate_ramp,
    } = params;

    const visibleDuration = 0.5;
    const totalSamples = Math.floor(visibleDuration * sampleRate);
    if (totalSamples === 0) return;

    const rateRampDelta = (rate_ramp * 20) / sampleRate;
    const noteStartSamples: number[] = [];
    let currentSample = 0;
    let currentRate = rate;

    while (
      noteStartSamples.length < max_notes &&
      currentSample < totalSamples
    ) {
      noteStartSamples.push(currentSample);
      if (currentRate <= 0) {
        // Rate of zero means this note holds for the rest of the duration
        currentSample = totalSamples;
        break;
      }
      currentSample += Math.round(sampleRate / currentRate);
      currentRate = Math.max(0, rate + rateRampDelta * currentSample);
    }

    const length = noteStartSamples.length;
    if (length === 0) return;

    const numT =
      Math.max(tones.length, levels.length, shapes.length, phases.length) || 1;
    const tonesLength = Math.max(tones.length, 1);
    const topY = 5;
    const bottomY = h - 1;

    // Pre-pass: compute per-note data and find the actual semitone range
    let minSemi = Infinity;
    let maxSemi = -Infinity;
    const noteData: { isReversed: boolean; octaveSemitones: number }[] = [];

    for (let i = 0; i < length; i++) {
      const cycleIndex = getCycleIndex(i, tonesLength);
      const isReversed = isChoicesReversed(cycleIndex, direction);
      const octaveSemitones = getOctaveSemitones(
        cycleIndex,
        isReversed,
        max_octaves,
      );
      noteData.push({ isReversed, octaveSemitones });
      const tone = choose(tones, numT, i, isReversed) ?? 0;
      const semi = octaveSemitones + tone;
      if (semi < minSemi) minSemi = semi;
      if (semi > maxSemi) maxSemi = semi;
    }

    if (!isFinite(minSemi)) minSemi = 0;
    if (!isFinite(maxSemi)) maxSemi = 0;
    if (minSemi === maxSemi) {
      minSemi -= 1;
      maxSemi += 1;
    }

    const semiRange = maxSemi - minSemi;
    const semiToY = (semi: number): number => {
      const t = (semi - minSemi) / semiRange;
      return bottomY - t * (bottomY - topY);
    };

    const displaySamples = Math.min(totalSamples, currentSample);

    const xOf = (sample: number): number => (sample / displaySamples) * w;
    const noteX = (i: number): number => xOf(noteStartSamples[i]);
    const noteEndX = (i: number): number =>
      i + 1 < length
        ? xOf(noteStartSamples[i + 1])
        : Math.min(w, xOf(currentSample));

    // Dividers at actual note boundaries (no longer uniformly spaced)
    ctx.strokeStyle = "#404040";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    for (let i = 1; i < length; i++) {
      ctx.moveTo(noteX(i), 0);
      ctx.lineTo(noteX(i), h);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = color;
    ctx.fillStyle = `${color}20`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < length; i++) {
      const { isReversed, octaveSemitones } = noteData[i];
      const x0 = noteX(i);
      const x1 = noteEndX(i);
      const noteW = x1 - x0;

      if (type === "tones") {
        const tone = choose(tones, numT, i, isReversed) ?? 0;
        const y = semiToY(octaveSemitones + tone);
        ctx.fillRect(x0, y, noteW, bottomY - y);
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      } else if (type === "levels") {
        const level = choose(levels, numT, i, isReversed) ?? 1;
        const y = Math.max(
          topY,
          Math.min(bottomY, bottomY - level * (bottomY - topY)),
        );
        ctx.fillRect(x0, y, noteW, bottomY - y);
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      } else if (type === "shapes" || type === "phases") {
        const s = choose(shapes, numT, i, isReversed) ?? shape;
        const p = choose(phases, numT, i, isReversed) ?? 0;
        if (s) {
          const previewState = new OscillatorState(randomizer(0));
          const oscillator =
            OSCILLATORS[s as OscillatorType] ?? OSCILLATORS.sine;
          const steps = Math.max(2, Math.floor(noteW));

          const fullNoteEndSample =
            i + 1 < length ? noteStartSamples[i + 1] : currentSample;
          const fullNoteW = xOf(fullNoteEndSample) - x0;
          const visibleFraction = fullNoteW > 0 ? noteW / fullNoteW : 1;

          ctx.stroke();
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0, 0, noteW, h);
          ctx.clip();
          ctx.beginPath();
          for (let s = 0; s <= steps; s++) {
            const t = (s / steps) * visibleFraction;
            const sample = oscillator((t + p) % 1, previewState);
            const x = x0 + (s / steps) * noteW;
            const y = h * 0.5 - sample * h * 0.2;
            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.restore();
          ctx.beginPath();
        }
      }
    }

    ctx.stroke();
  }

  static drawArpeggioTones(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      type: "tones" | "levels" | "shapes" | "phases";
      shape: string;
      sampleRate: number;
      rate: number;
      rate_ramp: number;
      direction: Direction;
      max_octaves: number;
      max_notes: number;
      tones: number[];
      levels: number[];
      shapes: string[];
      phases: number[];
    },
  ) {
    SynthVisualizer.drawArpeggio(ctx, w, h, color, {
      ...params,
      type: "tones",
    });
  }

  static drawArpeggioLevels(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      type: "tones" | "levels" | "shapes" | "phases";
      shape: string;
      sampleRate: number;
      rate: number;
      rate_ramp: number;
      direction: Direction;
      max_octaves: number;
      max_notes: number;
      tones: number[];
      levels: number[];
      shapes: string[];
      phases: number[];
    },
  ) {
    SynthVisualizer.drawArpeggio(ctx, w, h, color, {
      ...params,
      type: "levels",
    });
  }

  static drawArpeggioShapes(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      type: "tones" | "levels" | "shapes" | "phases";
      shape: string;
      sampleRate: number;
      rate: number;
      rate_ramp: number;
      direction: Direction;
      max_octaves: number;
      max_notes: number;
      tones: number[];
      levels: number[];
      shapes: string[];
      phases: number[];
    },
  ) {
    SynthVisualizer.drawArpeggio(ctx, w, h, color, {
      ...params,
      type: "shapes",
    });
  }

  static drawDelay(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      length: number;
      strength: number;
      feedback: number;
    },
  ) {
    const { length, strength, feedback } = params;

    const visibleDuration = 1;

    const midY = h / 2;
    const maxBarH = (h - 4) / 2;
    const toX = (t: number) => (t / visibleDuration) * w;

    const dryMix = 0.5;

    // Pre-compute all visible echoes first so bar width can be sized to fit
    const impulses: { t: number; amplitude: number }[] = [];
    if (dryMix > 0) {
      impulses.push({ t: 0, amplitude: dryMix });
    }

    if (length > 0) {
      let t = 0;
      let echoDecay = 1.0;
      for (let n = 0; n < 200; n++) {
        t += length;
        if (t >= visibleDuration) break;
        const amplitude = strength * echoDecay;
        if (amplitude < 0.001) break;
        impulses.push({ t, amplitude });
        echoDecay *= Math.max(0, feedback);
      }
    }

    if (impulses.length === 0) return;

    // Bar width: fraction of first echo spacing, capped at 4% of canvas width.
    // At very short delay times this gracefully hits the 2px minimum.
    const firstEchoX =
      impulses.length > 1
        ? toX(impulses[1]!.t)
        : toX(length || visibleDuration);
    const barW = Math.max(2, Math.floor(Math.min(firstEchoX * 0.35, w * 0.04)));

    // Baseline
    ctx.strokeStyle = "#404040";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw impulses — symmetric bars above and below the midline
    ctx.lineWidth = 1.5;
    for (const { t, amplitude } of impulses) {
      const x = toX(t);
      const barH = amplitude * maxBarH;
      if (barH < 0.5) continue;

      ctx.fillStyle = `${color}40`;
      ctx.fillRect(x - barW / 2, midY - barH, barW, barH * 2);

      // Top and bottom cap lines
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x - barW / 2, midY - barH);
      ctx.lineTo(x + barW / 2, midY - barH);
      ctx.moveTo(x - barW / 2, midY + barH);
      ctx.lineTo(x + barW / 2, midY + barH);
      ctx.stroke();
    }
  }

  static drawReverb(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      mix: number;
      room_size: number;
      damping: number;
    },
  ) {
    const { mix, room_size, damping } = params;
    ctx.strokeStyle = "#404040";
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (mix > 0) {
      ctx.fillStyle = `${color}20`;
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h / 2);
      for (let x = w * 0.1; x <= w; x++) {
        const t = (x - w * 0.1) / (w * 0.9);
        ctx.lineTo(
          x,
          h / 2 -
            mix *
              (h * 0.4) *
              Math.exp(-t * ((1 + damping * 5) / Math.max(0.01, room_size))),
        );
      }
      for (let x = w; x >= w * 0.1; x--) {
        const t = (x - w * 0.1) / (w * 0.9);
        ctx.lineTo(
          x,
          h / 2 +
            mix *
              (h * 0.4) *
              Math.exp(-t * ((1 + damping * 5) / Math.max(0.01, room_size))),
        );
      }
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w * 0.04, h / 2);
    ctx.lineTo(w * 0.04, h * 0.1);
    ctx.lineTo(w * 0.06, h * 0.9);
    ctx.lineTo(w * 0.06, h / 2);
    ctx.lineTo(w * 0.1, h / 2);
    for (let x = w * 0.1; x <= w; x += 0.5) {
      const t = (x - w * 0.1) / (w * 0.9);
      ctx.lineTo(
        x,
        h / 2 +
          mix *
            (h * 0.4) *
            Math.exp(-t * ((1 + damping * 5) / Math.max(0.01, room_size))) *
            (Math.sin(x * 0.8) * Math.cos(x * 1.5)),
      );
    }
    ctx.stroke();
  }

  static drawHarmonics(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      count: number;
      falloff: number;
    },
  ) {
    const { count, falloff } = params;

    const bottomY = h;
    const usableH = bottomY;

    const countStart = count;

    const maxSlots = Math.max(7, countStart);

    // Compute start and end state of ramps (both clamped to [0,1] as in audio)
    const falloffStart = SynthVisualizer.clamp(falloff, 0, 1);

    // All 7 slots evenly distributed — bars narrower than their columns
    const colW = w / maxSlots;
    const barW = Math.max(2, Math.floor(colW * 0.55));
    const barPad = (colW - barW) / 2;

    // Baseline
    ctx.strokeStyle = "#404040";
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, bottomY);
    ctx.lineTo(w, bottomY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Solid bars for start state
    ctx.fillStyle = `${color}40`;
    for (let i = 0; i < countStart; i++) {
      const barH = Math.pow(falloffStart, i) * usableH;
      ctx.fillRect(i * colW + barPad, bottomY - barH, barW, barH);
    }

    // Top edge strokes for start bars
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < countStart; i++) {
      const barH = Math.pow(falloffStart, i) * usableH;
      const x = i * colW + barPad;
      ctx.moveTo(x, bottomY - barH);
      ctx.lineTo(x + barW, bottomY - barH);
    }
    ctx.stroke();
  }

  static drawFM(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      ratio: number;
      ratio_ramp: number;
      strength: number;
      strength_ramp: number;
    },
  ) {
    const { ratio, ratio_ramp, strength, strength_ramp } = params;

    // Matches audio constant: fmStrength * FM_STRENGTH_MULTIPLIER
    const FM_STRENGTH_MULTIPLIER = 0.8;

    // Show 4 carrier cycles. FM modulator runs at ratio * 4 cycles over the preview.
    // Depth is relative to carrier speed (not absolute Hz) so the preview is
    // meaningful regardless of the actual base pitch.
    const periods = 4;
    const steps = 1000;

    // Baseline
    ctx.strokeStyle = "#404040";
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    let fmAngle = 0;
    let carrierAngle = 0;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;

      // Both ramp linearly over duration, matching per-sample accumulation in audio.
      // ratio_ramp: ratio units/sec, clamped to >= 0
      // strength_ramp: clamped to [0,1] as in audio
      const currentRatio = Math.max(0, ratio + ratio_ramp * t);
      const currentStrength = SynthVisualizer.clamp(
        strength + strength_ramp * t,
        0,
        1,
      );

      // FM modulator advances at currentRatio × carrier speed
      fmAngle += (currentRatio * periods) / steps;
      const fmDepth = currentStrength * FM_STRENGTH_MULTIPLIER;
      const fmMod = Math.sin(2 * Math.PI * fmAngle) * fmDepth;

      // Carrier frequency is modulated: 1 ± fmDepth relative to base
      // At max strength (0.8 depth), instantaneous freq stays positive (0.2–1.8×)
      carrierAngle += (periods * (1 + fmMod)) / steps;

      const val = Math.sin(2 * Math.PI * carrierAngle);
      const y = h / 2 - val * h * 0.4;

      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(t * w, y);
    }

    ctx.stroke();
  }

  static drawBitcrush(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: {
      crush: number;
      crush_ramp?: number;
      skip: number;
      skip_ramp?: number;
    },
  ) {
    const { crush, crush_ramp = 0, skip, skip_ramp = 0 } = params;

    // Duplicated from engine to ensure standalone accuracy in visualizer
    const BITCRUSH_CRUSH_EXPONENT = 0.2;
    const BITCRUSH_BIT_DEPTH = 16;
    const BITSKIP_MIN_PHASE_DELTA = 0.001;
    const BITSKIP_PHASE_EXPONENT = 4;

    // Baseline
    ctx.strokeStyle = "#404040";
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    // Simulate 20ms of audio, showing exactly 3 periods of a 150Hz sine wave
    const sampleRate = 44100;
    const windowDuration = 0.02;
    const lengthInSamples = Math.floor(windowDuration * sampleRate);
    const freq = 150;

    let skipPhase = 1.0;
    let skipLastSample = 0.0;
    let lastY = h / 2;

    for (let i = 0; i <= lengthInSamples; i++) {
      const t_norm = i / lengthInSamples;
      const time = t_norm * windowDuration;

      // Base sine wave
      let sampleValue = Math.sin(time * Math.PI * 2 * freq);

      // Apply linear ramps (clamped to 0-1) matching how audio handles parameter drift
      const currentCrush = SynthVisualizer.clamp(
        crush + crush_ramp * t_norm,
        0,
        1,
      );
      const currentSkip = SynthVisualizer.clamp(
        skip + skip_ramp * t_norm,
        0,
        1,
      );

      // 1. Crush Logic (Amplitude Quantization)
      const crushValue = Math.pow(currentCrush, BITCRUSH_CRUSH_EXPONENT);
      const numOptions = Math.pow(
        2,
        BITCRUSH_BIT_DEPTH - BITCRUSH_BIT_DEPTH * crushValue,
      );
      sampleValue = Math.trunc(sampleValue * numOptions) / numOptions;

      // 2. Skip Logic (Time Decimation)
      skipPhase +=
        (BITSKIP_MIN_PHASE_DELTA +
          Math.pow(1.0 - currentSkip, BITSKIP_PHASE_EXPONENT)) *
        (44100 / sampleRate);

      if (skipPhase > 1.0) {
        skipPhase -= 1.0;
        skipLastSample = sampleValue;
      }

      const x = t_norm * w;
      const y = h / 2 - skipLastSample * (h * 0.4);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        // Force crisp 90-degree staircases for sample-and-hold drops
        if (y !== lastY) {
          ctx.lineTo(x, lastY);
        }
        ctx.lineTo(x, y);
      }

      lastY = y;
    }

    ctx.stroke();
  }
}
