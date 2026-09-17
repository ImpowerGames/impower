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

export { NODES_DEFAULTS, nodesTrack, type NodesOptions, type NodesResult, type NodesTrack } from "./methods/nodes";
export { TAPER_DEFAULTS, taperTrack, type TaperOptions, type TaperResult, type TaperTrack } from "./methods/taper";
export { OUTLINE_DEFAULTS, outlineTrack, type OutlineOptions, type OutlineResult, type OutlineTrack } from "./methods/outline";
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
