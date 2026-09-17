import { serializePathData, serializeSegments } from "./path/serialize";
import type { Cubic, Subpath, SubpathMorph } from "./types";

/** Numbers per segment in a sample frame: p0, c1, c2, p1 as x, y pairs. */
export const SEGMENT_STRIDE = 8;

/**
 * Precomputed frames of one morph with compatible topology, ready for the
 * player to interpolate numerically every tick. The authored endpoints are
 * kept as path data so the rest poses render the drawing itself.
 */
export interface MorphSamples {
  /** Number of frames, evenly spaced over progress 0 to 1 inclusive. */
  count: number;
  /** Segments per subpath; every frame shares this layout. */
  segmentCounts: number[];
  /** Whether each subpath closes. */
  closed: boolean[];
  /** One flat buffer per frame, `sum(segmentCounts) * SEGMENT_STRIDE` long. */
  frames: Float64Array[];
  /** The authored drawings, serialised. */
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

/**
 * Samples `count` frames of a morph at evenly spaced progress values. The
 * count trades bake cost and memory for fidelity; eight is a starting point
 * for lash-sized art, not a guarantee for every drawing.
 */
export function sampleMorph(morph: SubpathMorph, count = 8): MorphSamples {
  const n = Math.max(2, Math.round(count));
  const first = morph.frame(0);
  const frames: Float64Array[] = [];
  for (let i = 0; i < n; i++) frames.push(packFrame(morph.frame(i / (n - 1))));
  return {
    count: n,
    segmentCounts: first.map((s) => s.segments.length),
    closed: first.map((s) => s.closed),
    frames,
    from: serializePathData(morph.from),
    to: serializePathData(morph.to),
  };
}

/**
 * The frame at `progress`, linearly interpolated between the two nearest
 * samples. Progress arrives already shaped by the author's timing; nothing
 * here eases it again. Pass `out` to reuse a buffer across ticks.
 */
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

/** Unpacks a frame buffer into subpaths. */
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

/** Path data for a frame buffer, without going through subpath objects. */
export function frameToPathData(samples: MorphSamples, values: Float64Array, precision = 2): string {
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
