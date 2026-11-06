import type { ProgramImage } from "@impower/sparkdown/src/program/ProgramImages";
import { StringValue } from "@impower/sparkdown/src/runtime/Value";
import type { ImageParts } from "../classes/CheckpointStore";

const OBJECT_BYTES = 64;
const ENTRY_BYTES = 32;
const SLOT_BYTES = 8;

const valueBytes = (value: object): number =>
  value instanceof StringValue
    ? OBJECT_BYTES + (value.value?.length ?? 0) * 2
    : OBJECT_BYTES;

export const imageParts = (image: ProgramImage): ImageParts => {
  const shared = new Map<object, number>();
  const share = (value: unknown) => {
    if (value && typeof value === "object" && !shared.has(value)) {
      shared.set(value, valueBytes(value));
    }
  };
  let bytes = OBJECT_BYTES;
  bytes += image.visits?.byteLength ?? 0;
  bytes += image.turns?.byteLength ?? 0;
  bytes += image.countIds?.byteLength ?? 0;
  bytes += image.countVisits?.byteLength ?? 0;
  bytes += image.countTurns?.byteLength ?? 0;
  bytes += ENTRY_BYTES * (image.globals.size + image.cells.size);
  for (const value of image.globals.values()) {
    share(value);
  }
  for (const copy of image.cells.values()) {
    share(copy.value);
  }
  for (const copy of image.tables.values()) {
    bytes += OBJECT_BYTES + ENTRY_BYTES * (copy.entries?.size ?? 0);
    for (const value of copy.entries?.values() ?? []) {
      share(value);
    }
  }
  const positional = image.positional;
  bytes +=
    OBJECT_BYTES * (1 + positional.frames + positional.threads.length) +
    SLOT_BYTES *
      (positional.evaluationStack.length +
        positional.output.length +
        positional.heldAddresses.length);
  for (const value of positional.evaluationStack) {
    share(value);
  }
  for (const value of positional.output) {
    share(value);
  }
  for (const choice of positional.choices) {
    bytes +=
      OBJECT_BYTES + choice.text.length * 2 + choice.sourcePath.length * 2;
  }
  const refs: unknown[] = [];
  if (image.parent) {
    refs.push(image.parent);
  }
  if (image.keyframe !== image) {
    refs.push(image.keyframe);
  }
  if (image.afterChoice) {
    refs.push(image.afterChoice.menu);
  }
  return { bytes, shared, refs };
};
