import type { ProgramImage } from "@impower/sparkdown/src/program/ProgramImages";
import type { PositionalCopy } from "@impower/sparkdown/src/program/ProgramStoryState";
import {
  ObjectValue,
  StringValue,
  VariablePointerValue,
} from "@impower/sparkdown/src/runtime/Value";
import type { ImageParts } from "../classes/CheckpointStore";

const OBJECT_BYTES = 64;
const ENTRY_BYTES = 32;
const SLOT_BYTES = 8;

type ThreadCopy = PositionalCopy["threads"][number];

export const imageParts = (image: ProgramImage): ImageParts => {
  const shared = new Map<unknown, number>();
  const pending: unknown[] = [];
  let bytes = OBJECT_BYTES;
  const share = (value: unknown) => {
    if (value && typeof value === "object" && !shared.has(value)) {
      shared.set(value, OBJECT_BYTES);
      pending.push(value);
    }
  };
  const shareKeys = (keys: Iterable<string>): number => {
    let count = 0;
    for (const key of keys) {
      count += 1;
      if (!shared.has(key)) {
        shared.set(key, key.length * 2);
      }
    }
    return ENTRY_BYTES * count;
  };
  const walk = () => {
    while (pending.length > 0) {
      const value = pending.pop();
      if (value instanceof StringValue) {
        shared.set(value, OBJECT_BYTES + (value.value?.length ?? 0) * 2);
      } else if (value instanceof ObjectValue) {
        const entries = value.value;
        shared.set(value, OBJECT_BYTES + shareKeys(entries?.keys() ?? []));
        for (const entry of entries?.values() ?? []) {
          share(entry);
        }
        share(value.metatable);
      } else if (value instanceof VariablePointerValue) {
        if (value.isClosed) {
          share(value.closedValue);
        }
      } else if (Array.isArray((value as { values?: unknown }).values)) {
        for (const inner of (value as { values: unknown[] }).values) {
          share(inner);
        }
      }
    }
  };
  const thread = (copy: ThreadCopy) => {
    bytes += OBJECT_BYTES * (1 + copy.elements.length);
    for (const element of copy.elements) {
      for (const scope of element.scopes) {
        bytes += OBJECT_BYTES + shareKeys(scope.keys());
        for (const value of scope.values()) {
          share(value);
        }
      }
      bytes += SLOT_BYTES * (element.open.length + element.borrowed.length);
      element.open.forEach(share);
      element.borrowed.forEach(share);
    }
  };
  bytes += image.visits?.byteLength ?? 0;
  bytes += image.turns?.byteLength ?? 0;
  bytes += image.countIds?.byteLength ?? 0;
  bytes += image.countVisits?.byteLength ?? 0;
  bytes += image.countTurns?.byteLength ?? 0;
  bytes += ENTRY_BYTES * (image.globals.size + image.cells.size);
  for (const value of image.globals.values()) {
    share(value);
  }
  for (const [cell, copy] of image.cells) {
    share(cell);
    share(copy.value);
  }
  for (const [table, copy] of image.tables) {
    bytes += OBJECT_BYTES + shareKeys(copy.entries?.keys() ?? []);
    share(table);
    for (const value of copy.entries?.values() ?? []) {
      share(value);
    }
    share(copy.metatable);
  }
  const positional = image.positional;
  const carried = positional.carried?.output ?? [];
  bytes +=
    OBJECT_BYTES +
    SLOT_BYTES *
      (positional.evaluationStack.length +
        positional.output.length +
        carried.length +
        positional.heldAddresses.length);
  positional.evaluationStack.forEach(share);
  positional.output.forEach(share);
  carried.forEach(share);
  positional.threads.forEach(thread);
  for (const choice of positional.choices) {
    bytes +=
      OBJECT_BYTES + choice.text.length * 2 + choice.sourcePath.length * 2;
    thread(choice.thread);
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
