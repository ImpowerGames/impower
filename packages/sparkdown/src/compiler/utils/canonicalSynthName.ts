// The form `SparkdownCompiler.canonicalizeSyntheticFlowNames` gives every
// synthetic name it numbers. The pass also collects every name of this form
// as one of its own, so an author's name of this form is reported as reserved.
export const CANONICAL_SYNTH_NAME = /^__synth_\d+$/;
