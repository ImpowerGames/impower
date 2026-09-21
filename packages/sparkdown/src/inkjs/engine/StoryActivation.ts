import type { InkObject } from "./Object";

// Several runtime stories can share one runtime object: an incremental compile
// moves the unchanged parts of the story before it into the new one. Which
// story is being run decides the object's parent and the paths resolved
// through it, so every value a runtime object derives by walking its parents
// is cached against `activation.epoch` and lapses when a different story is
// made the one that runs (`SparkdownCompiler.activateStory`).
//
// `reparent` is told about an object that already has a parent before a
// container takes it, while a compile is recording what it moves so the
// story it moved the object from can be run again. It is null otherwise.
export const activation: {
  epoch: number;
  reparent: ((obj: InkObject) => void) | null;
} = { epoch: 0, reparent: null };
