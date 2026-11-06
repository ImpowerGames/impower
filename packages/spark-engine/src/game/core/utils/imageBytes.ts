import type { ProgramImage } from "@impower/sparkdown/src/program/ProgramImages";

const OBJECT_BYTES = 64;
const ENTRY_BYTES = 32;
const SLOT_BYTES = 8;

export const imageBytes = (image: ProgramImage): number => {
  let bytes = OBJECT_BYTES;
  bytes += image.visits?.byteLength ?? 0;
  bytes += image.turns?.byteLength ?? 0;
  bytes += image.countIds?.byteLength ?? 0;
  bytes += image.countVisits?.byteLength ?? 0;
  bytes += image.countTurns?.byteLength ?? 0;
  bytes += ENTRY_BYTES * (image.globals.size + image.cells.size);
  for (const copy of image.tables.values()) {
    bytes += OBJECT_BYTES + ENTRY_BYTES * (copy.entries?.size ?? 0);
  }
  const positional = image.positional;
  bytes +=
    OBJECT_BYTES * (1 + positional.frames + positional.threads.length) +
    SLOT_BYTES *
      (positional.evaluationStack.length +
        positional.output.length +
        positional.heldAddresses.length);
  for (const choice of positional.choices) {
    bytes += OBJECT_BYTES + choice.text.length * 2 + choice.sourcePath.length * 2;
  }
  return bytes;
};
