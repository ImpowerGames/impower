import type { ProgramImage } from "@impower/sparkdown/src/program/ProgramImages";
import type { PositionalCopy } from "@impower/sparkdown/src/program/ProgramStoryState";
import {
  ObjectValue,
  StringValue,
  VariablePointerValue,
} from "@impower/sparkdown/src/runtime/Value";
import type { ImageParts, ValueParts } from "../classes/CheckpointStore";

const OBJECT_BYTES = 64;
const ENTRY_BYTES = 32;
const SLOT_BYTES = 8;

type ThreadCopy = PositionalCopy["threads"][number];

const LEAF: readonly unknown[] = [];

export const valueParts = (value: unknown): ValueParts => {
  if (typeof value === "string") {
    return { bytes: value.length * 2, children: LEAF };
  }
  if (value instanceof StringValue) {
    return {
      bytes: OBJECT_BYTES + (value.value?.length ?? 0) * 2,
      children: LEAF,
    };
  }
  if (value instanceof ObjectValue) {
    const entries = value.value;
    const children: unknown[] = [];
    for (const [key, entry] of entries ?? []) {
      children.push(key, entry);
    }
    if (value.metatable) {
      children.push(value.metatable);
    }
    return {
      bytes: OBJECT_BYTES + ENTRY_BYTES * (entries?.size ?? 0),
      children,
    };
  }
  if (value instanceof VariablePointerValue) {
    return {
      bytes: OBJECT_BYTES,
      children: value.isClosed ? [value.closedValue] : LEAF,
    };
  }
  const values = (value as { values?: unknown }).values;
  return {
    bytes: OBJECT_BYTES,
    children: Array.isArray(values) ? values : LEAF,
  };
};

export const imageParts = (image: ProgramImage): ImageParts => {
  const roots = new Set<unknown>();
  let bytes = OBJECT_BYTES;
  const hold = (value: unknown) => {
    if (value && (typeof value === "object" || typeof value === "string")) {
      roots.add(value);
    }
  };
  const holdEntries = (entries: Iterable<[string, unknown]>): number => {
    let count = 0;
    for (const [key, value] of entries) {
      count += 1;
      hold(key);
      hold(value);
    }
    return ENTRY_BYTES * count;
  };
  const thread = (copy: ThreadCopy) => {
    bytes += OBJECT_BYTES * (1 + copy.elements.length);
    for (const element of copy.elements) {
      for (const scope of element.scopes) {
        bytes += OBJECT_BYTES + holdEntries(scope);
      }
      bytes += SLOT_BYTES * (element.open.length + element.borrowed.length);
      element.open.forEach(hold);
      element.borrowed.forEach(hold);
    }
  };
  bytes += image.visits?.byteLength ?? 0;
  bytes += image.turns?.byteLength ?? 0;
  bytes += image.countIds?.byteLength ?? 0;
  bytes += image.countVisits?.byteLength ?? 0;
  bytes += image.countTurns?.byteLength ?? 0;
  bytes += ENTRY_BYTES * (image.globals.size + image.cells.size);
  for (const value of image.globals.values()) {
    hold(value);
  }
  for (const [cell, copy] of image.cells) {
    hold(cell);
    hold(copy.value);
  }
  for (const [table, copy] of image.tables) {
    bytes += OBJECT_BYTES + holdEntries(copy.entries ?? []);
    hold(table);
    hold(copy.metatable);
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
  positional.evaluationStack.forEach(hold);
  positional.output.forEach(hold);
  carried.forEach(hold);
  positional.threads.forEach(thread);
  for (const choice of positional.choices) {
    bytes +=
      OBJECT_BYTES + choice.text.length * 2 + choice.sourcePath.length * 2;
    thread(choice.thread);
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
  return { bytes, roots: [...roots], refs };
};
