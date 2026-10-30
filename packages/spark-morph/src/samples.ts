import { serializePathData, serializeSegments } from "./path/serialize";
import type { Cubic, Subpath, SubpathMorph } from "./types";

export const SEGMENT_STRIDE = 8;

export interface MorphSamples {
  count: number;
  segmentCounts: number[];
  closed: boolean[];
  frames: Float64Array[];
  from: string;
  to: string;
}

function packFrame(subpaths: Subpath[]): Float64Array {
  const total = subpaths.reduce((n, s) => n + s.segments.length, 0);
  const out = new Float64Array(total * SEGMENT_STRIDE);
  let k = 0;
  for (const s of subpaths) {
    for (const seg of s.segments) {
      out[k++] = seg.p0[0];
      out[k++] = seg.p0[1];
      out[k++] = seg.c1[0];
      out[k++] = seg.c1[1];
      out[k++] = seg.c2[0];
      out[k++] = seg.c2[1];
      out[k++] = seg.p1[0];
      out[k++] = seg.p1[1];
    }
  }
  return out;
}

export interface SampleOptions {
  precision?: number;
}

export function sampleMorph(morph: SubpathMorph, count = 8, options: SampleOptions = {}): MorphSamples {
  const n = Math.max(2, Math.round(count));
  const first = morph.frame(0);
  const frames: Float64Array[] = [];
  for (let i = 0; i < n; i++) frames.push(packFrame(morph.frame(i / (n - 1))));
  return {
    count: n,
    segmentCounts: first.map((s) => s.segments.length),
    closed: first.map((s) => s.closed),
    frames,
    from: serializePathData(morph.from, options.precision),
    to: serializePathData(morph.to, options.precision),
  };
}

export function interpolateSamples(samples: MorphSamples, progress: number, out?: Float64Array): Float64Array {
  const t = Math.max(0, Math.min(1, progress));
  const u = t * (samples.count - 1);
  const i = Math.min(samples.count - 2, Math.floor(u));
  const f = u - i;
  const a = samples.frames[i]!,
    b = samples.frames[i + 1]!;
  const dst = out && out.length === a.length ? out : new Float64Array(a.length);
  if (f === 0) dst.set(a);
  else if (f === 1) dst.set(b);
  else for (let k = 0; k < a.length; k++) dst[k] = a[k]! + (b[k]! - a[k]!) * f;
  return dst;
}

export function unpackFrame(samples: MorphSamples, values: Float64Array): Subpath[] {
  const subpaths: Subpath[] = [];
  let k = 0;
  samples.segmentCounts.forEach((count, si) => {
    const segments: Cubic[] = [];
    for (let i = 0; i < count; i++) {
      segments.push({
        p0: [values[k]!, values[k + 1]!],
        c1: [values[k + 2]!, values[k + 3]!],
        c2: [values[k + 4]!, values[k + 5]!],
        p1: [values[k + 6]!, values[k + 7]!],
      });
      k += SEGMENT_STRIDE;
    }
    subpaths.push({ segments, closed: samples.closed[si] ?? true });
  });
  return subpaths;
}

export function frameToPathData(samples: MorphSamples, values: Float64Array, precision: number | undefined = 2): string {
  let d = "";
  let k = 0;
  samples.segmentCounts.forEach((count, si) => {
    const segments: Cubic[] = [];
    for (let i = 0; i < count; i++) {
      segments.push({
        p0: [values[k]!, values[k + 1]!],
        c1: [values[k + 2]!, values[k + 3]!],
        c2: [values[k + 4]!, values[k + 5]!],
        p1: [values[k + 6]!, values[k + 7]!],
      });
      k += SEGMENT_STRIDE;
    }
    d += serializeSegments(segments, samples.closed[si] ?? true, precision);
  });
  return d;
}
