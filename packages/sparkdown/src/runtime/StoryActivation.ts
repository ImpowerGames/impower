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
//
// `generation` numbers compiles: it is the number of the compile in progress,
// or of the next one between compiles. Every runtime object and debug
// metadata records the generation it was created in (`_birth`). A compile
// carries only what the story before it holds, so an object a later story
// shares with a story of generation `g` was born in `g` or before it, and an
// object born after `g` is none of that story's.
export const activation: {
  epoch: number;
  generation: number;
  reparent: ((obj: InkObject) => void) | null;
} = { epoch: 0, generation: 0, reparent: null };
