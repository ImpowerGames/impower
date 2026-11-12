import type { AddedFile } from "../workspace/addAssetFiles";

export const FILE_DROP_HIDE_MS = 160;

export const FILE_DROP_TARGET = "data-file-drop-target";

export const carriesFiles = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

export const droppedFiles = (event: DragEvent): AddedFile[] =>
  Array.from(event.dataTransfer?.files ?? []).map((file) => ({
    name: file.name,
    size: file.size,
    getBuffer: () => file.arrayBuffer(),
  }));
