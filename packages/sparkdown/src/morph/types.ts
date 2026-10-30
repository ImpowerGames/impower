export const MORPH_BAKE_FORMAT = 19;

export type MorphBlend = "morph" | "fade" | "cut" | "scale";
export type MorphFallback = "fade" | "cut" | "scale";
export type MorphMethodName = "match" | "bend" | "trace";

export interface MorphPolicy {
  blend?: MorphBlend;
  method?: MorphMethodName;
  fallback?: MorphFallback;
  depth?: string;
  partner?: string[];
}

export interface MorphRecipe {
  name: string;
  blend: MorphBlend;
  method?: MorphMethodName;
  fallback: MorphFallback;
  depth?: string;
  layers: Record<string, MorphPolicy>;
  keyframes: { offset: number; states: Record<string, string> }[];
  clips: { between: string[]; targets: string[] }[];
  paints?: MorphPaintEntry[];
}

export interface MorphPaintEntry {
  targets: string[];
  state: string;
  when?: string;
  fill?: string;
  stroke?: string;
  opacity?: number;
  span: number;
}

export interface MorphRef {
  morph: string;
  key: string;
  image: string;
  selection: string;
  groups: string[];
  src?: string;
}

export interface MorphTiming {
  duration: number;
  delay: number;
  easing: string;
  iterations: number | "infinite";
  direction: "normal" | "reverse" | "alternate" | "alternate-reverse";
  iteration_delay_min?: number;
  iteration_delay_max?: number;
}

export interface MorphProgramChannel {
  recipes: Record<string, string>;
  variants: Record<string, MorphRef[]>;
}

export type MorphDiagnosticCode =
  | "method-failed"
  | "missing-method"
  | "pairing-count"
  | "edge-not-bend"
  | "edge-missing"
  | "edge-compound"
  | "aperture-ambiguous"
  | "aperture-unpaired"
  | "aperture-degenerate"
  | "clip-self-dependent"
  | "target-missing"
  | "mixed-groups"
  | "unsupported-transform"
  | "unsupported-element"
  | "resource-missing"
  | "source-unreadable"
  | "inactive-variant"
  | "depth-ignored"
  | "paint-target-missing"
  | "partner-missing";

export interface MorphBakeDiagnostic {
  code: MorphDiagnosticCode;
  severity: "warning" | "error";
  message: string;
  uri?: string;
  morph: string;
  variant?: string;
  layer?: string;
  path?: string;
}

export interface MorphPart {
  kind: "static" | "live";
  svg: string;
}

export interface MorphFrames {
  count: number;
  segmentCounts: number[];
  closed: boolean[];
  lines?: boolean;
  frames: number[][];
}

export interface MorphGeometryRef {
  index: number;
  reversed: boolean;
}

export type MorphTransition =
  | {
      kind: "morph";
      from: string;
      to: string;
      draw: string;
      shared: boolean;
      frames: MorphGeometryRef;
      paint?: MorphPaint;
      gradients?: { fill?: MorphGradientBlend; stroke?: MorphGradientBlend };
      partner?: true;
    }
  | { kind: "fade"; from?: string; to?: string }
  | { kind: "cut"; from?: string; to?: string }
  | { kind: "scale"; node: string; draw: string; direction: "shrink" | "grow"; frames: MorphGeometryRef }
  | { kind: "hold"; node: string };

export type MorphColor = [number, number, number, number];

export interface MorphPaint {
  fill?: [MorphColor, MorphColor];
  stroke?: [MorphColor, MorphColor];
  "fill-opacity"?: [number, number];
  "stroke-opacity"?: [number, number];
  opacity?: [number, number];
}

export interface MorphGradient {
  kind: "linear" | "radial";
  units: "userSpaceOnUse" | "objectBoundingBox";
  spread: "pad" | "reflect" | "repeat";
  geometry: number[];
  transform: number[];
  stops: [number, MorphColor][];
}

export interface MorphGradientBlend {
  id: string;
  ends: [MorphGradient, MorphGradient];
}

export interface MorphPaintBase {
  fill?: MorphColor;
  stroke?: MorphColor;
  opacity?: number;
}

export interface MorphPaintPose {
  group: string;
  state: string;
  span: number;
  fill?: MorphColor;
  stroke?: MorphColor;
  opacity?: number;
  nodes: Record<string, MorphPaintBase>;
  tracks: {
    segment: number;
    draw: string;
    ends: { fill?: [MorphColor, MorphColor]; stroke?: [MorphColor, MorphColor]; opacity?: [number, number] };
  }[];
}

export interface MorphClipFrames {
  clip: number;
  loops: MorphGeometryRef;
  reach?: { aperture: string; loops: number[] }[];
}

export interface MorphSegment {
  group: string;
  from: { offset: number; state: string };
  to: { offset: number; state: string };
  transitions: MorphTransition[];
  clips: MorphClipFrames[];
  shapes?: Record<string, string>;
  carry?: { from?: Record<string, string>; to?: Record<string, string> };
}

export interface MorphClipTarget {
  clip: number;
  aperture: string;
  matrix: number[];
}

export interface MorphArtifact {
  format: number;
  key: string;
  morph: string;
  variant?: string;
  status: "live" | "static";
  viewBox?: string;
  width?: string;
  height?: string;
  rest: string;
  idPrefix: string;
  parts: MorphPart[];
  visibility: Record<string, Record<string, string[]>>;
  schedules: Record<string, { offset: number; state: string }[]>;
  segments: MorphSegment[];
  frames: MorphFrames[];
  apertures: number[][][][];
  apertureEdges: number[][][][][];
  clipTargets: MorphClipTarget[];
  paints?: MorphPaintPose[];
  diagnostics: MorphBakeDiagnostic[];
}
