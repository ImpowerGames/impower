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

export { parsePathData, arcToCubics } from "./path/parse";
export { serializePathData, serializeSegments } from "./path/serialize";
export { basicShapeToPathData, basicShapeToSubpaths, type BasicShape } from "./path/shapes";

export {
  ArcLoop,
  anchorMean,
  closeLoop,
  evalCubic,
  lerpLoops,
  loopToPolyline,
  polygonArea,
  polygonSelfIntersects,
  reverseLoop,
  sameLoop,
  segLength,
  selfIntersects,
  signedArea,
  snapClosed,
  splitCubic,
} from "./geometry/cubic";

export {
  RIBBON_DEFAULTS,
  findTips,
  ribbonTrack,
  smoothAnchors,
  taperDistance,
  type RibbonOptions,
  type RibbonResult,
  type RibbonTips,
  type RibbonTrack,
} from "./methods/ribbon";
export { SHAPE_DEFAULTS, shapeTrack, type ShapeOptions, type ShapeResult, type ShapeTrack } from "./methods/shape";
export { scaleTrack, collapsedLoop, type ScaleTrack } from "./methods/scale";

export { morphSubpaths, morphScale, type MorphOptions, type ScaleMorph } from "./morph";
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
} from "./samples";
