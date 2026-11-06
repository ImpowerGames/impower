import type { ProgramImage } from "@impower/sparkdown/src/program/ProgramImages";
import { ObjectValue, StringValue } from "@impower/sparkdown/src/runtime/Value";
import type { ImageParts } from "../classes/CheckpointStore";

const OBJECT_BYTES = 64;
const ENTRY_BYTES = 32;
const SLOT_BYTES = 8;

const entriesBytes = (entries: ReadonlyMap<string, unknown> | null): number => {
  let bytes = 0;
  for (const key of entries?.keys() ?? []) {
    bytes += ENTRY_BYTES + key.length * 2;
  }
  return bytes;
};

export const imageParts = (image: ProgramImage): ImageParts => {
  const shared = new Map<object, number>();
  const pending: unknown[] = [];
  const share = (value: unknown) => {
    if (value && typeof value === "object" && !shared.has(value)) {
      pending.push(value);
      shared.set(value, OBJECT_BYTES);
    }
  };
  const walk = () => {
    while (pending.length > 0) {
      const value = pending.pop();
      if (value instanceof StringValue) {
        shared.set(value, OBJECT_BYTES + (value.value?.length ?? 0) * 2);
      } else if (value instanceof ObjectValue) {
        const entries = value.value;
        shared.set(value, OBJECT_BYTES + entriesBytes(entries));
        for (const entry of entries?.values() ?? []) {
          share(entry);
        }
        share(value.metatable);
      }
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
  for (const [table, copy] of image.tables) {
    bytes += OBJECT_BYTES + ENTRY_BYTES * (copy.entries?.size ?? 0);
    share(table);
    for (const value of copy.entries?.values() ?? []) {
      share(value);
    }
    share(copy.metatable);
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
  walk();
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
