// The public surface: the pipeline entry points, the explicit method
// builders and their result types. Geometry helpers stay internal so the
// algorithms can change without a breaking change.
export type {
  Cubic,
  MorphFailure,
  MorphFailureCode,
  MorphMethod,
  MorphResult,
  Point,
  Subpath,
  SubpathMorph,
  SubpathTrack,
} from "./types";

export { parsePathData } from "./path/parse";
export { serializePathData, serializeSegments } from "./path/serialize";
export { basicShapeToPathData, basicShapeToSubpaths, type BasicShape } from "./path/shapes";

export { MATCH_DEFAULTS, matchTrack, type MatchOptions, type MatchResult, type MatchTrack } from "./methods/match";
export { BEND_DEFAULTS, bendTrack, type BendOptions, type BendResult, type BendTrack } from "./methods/bend";
export { TRACE_DEFAULTS, traceTrack, type TraceOptions, type TraceResult, type TraceTrack } from "./methods/trace";
export { scaleTrack, type ScaleTrack } from "./methods/scale";

export { MORPH_DEFAULTS, morphSubpaths, morphScale, type MorphOptions, type ScaleMorph } from "./morph";
export {
  pairShapes,
  shapePosition,
  trackIdFor,
  type LabelledShape,
  type PairingDiagnostic,
  type PairingResult,
  type ShapePair,
  type UnpairedReason,
  type UnpairedShape,
} from "./pairing";
export {
  buildApertures,
  type Aperture,
  type ApertureDiagnostic,
  type ApertureDiagnosticCode,
  type ApertureOptions,
  type ApertureResult,
  type EdgeTrack,
} from "./apertures";
export {
  SEGMENT_STRIDE,
  frameToPathData,
  interpolateSamples,
  sampleMorph,
  unpackFrame,
  type MorphSamples,
  type SampleOptions,
} from "./samples";
