import type { ImportFailureReason } from "@impower/spark-editor-protocol/src/types";
import { ASSET_TYPES } from "../utils/assetTypes";
import { bytesLabel, plural } from "../utils/fileListModel";
import { typeFolder, type AssetPaths } from "./assetsListing";
import { importOutcomeSentence } from "./projectImport";
import { isInside, parentOf, SCRIPTS_ROOT_LABEL, scriptsHome, shownPath } from "./scriptsListing";
import workspace from "./WorkspaceStore";

export type UploadReason =
  | { kind: "no_room"; needed: number; free: number }
  | { kind: "storage" }
  | { kind: "skipped" }
  | { kind: "unreadable" }
  | { kind: "failed"; message: string }
  | { kind: "replace_failed"; cause: "storage" | "failed"; message?: string }
  | { kind: "left_as_is" }
  | { kind: "replacing" }
  | { kind: "zip"; reason: ImportFailureReason; folders?: string[] };

export type UploadRow =
  | { id: number; name: string; state: "waiting" | "working" }
  | { id: number; name: string; state: "added"; path: string }
  | { id: number; name: string; state: "failed"; reason: UploadReason };

export type UploadRowState = UploadRow["state"];

let nextId = 0;

let grouped = 0;

const unfinished = (row: UploadRow) => row.state === "waiting" || row.state === "working";

const appendRows = (rows: UploadRow[]) => {
  const kept = workspace.uploads.peek();
  workspace.uploads.value = [...(grouped ? kept : kept.filter(unfinished)), ...rows];
};

export const withUploadGroup = async <T>(run: () => Promise<T>): Promise<T> => {
  workspace.uploads.value = workspace.uploads.peek().filter(unfinished);
  grouped++;
  try {
    return await run();
  } finally {
    grouped--;
  }
};

export const startUploads = (names: readonly string[]): number[] => {
  const rows: UploadRow[] = names.map((name) => ({ id: ++nextId, name, state: "waiting" }));
  appendRows(rows);
  return rows.map((row) => row.id);
};

export const refuseUploads = (names: readonly string[], reason: UploadReason): void => {
  appendRows(names.map((name) => ({ id: ++nextId, name, state: "failed", reason })));
};

type RowChange =
  | { state: "working" }
  | { state: "added"; path: string }
  | { state: "failed"; reason: UploadReason };

export const updateUpload = (id: number, change: RowChange): void => {
  workspace.uploads.value = workspace.uploads
    .peek()
    .map((row) => (row.id === id ? ({ id: row.id, name: row.name, ...change } as UploadRow) : row));
};

export const failUnfinished = (ids: readonly number[], reason: UploadReason): void => {
  const mine = new Set(ids);
  workspace.uploads.value = workspace.uploads
    .peek()
    .map((row) => (mine.has(row.id) && unfinished(row) ? { id: row.id, name: row.name, state: "failed", reason } : row));
};

export const writingCount = (rows: readonly UploadRow[]): number => rows.filter(unfinished).length;

export const uploadsWriting = (): number => writingCount(workspace.uploads.peek());

export const projectReplacing = (): boolean => workspace.signals.syncStatus.peek() === "importing";

export const closeUploads = (): void => {
  workspace.uploads.value = workspace.uploads.peek().filter(unfinished);
};

export const uploadHeading = (rows: readonly UploadRow[]): string => {
  const done = rows.filter((row) => !unfinished(row)).length;
  const failed = rows.filter((row) => row.state === "failed").length;
  if (done < rows.length) {
    return `Uploading ${done + 1} of ${rows.length}`;
  }
  return failed
    ? `${plural(rows.length - failed, "file")} added, ${failed} not added`
    : `${plural(rows.length, "file")} added`;
};

const REPLACED_NOTE = "The file it was replacing is in the recycle bin, and Undo puts it back.";

const REASON_SENTENCES: {
  [K in UploadReason["kind"]]: (reason: Extract<UploadReason, { kind: K }>, name: string) => string;
} = {
  no_room: ({ needed, free }) =>
    `Not added: these files need ${bytesLabel(needed)} and this browser has ${bytesLabel(free)} left, so free some space or add fewer at once.`,
  storage: () => "Not added: this browser ran out of room for it, so free some space and try again.",
  skipped: () => "Not added: you kept the file already there with this name.",
  unreadable: () => "Not added: the file could not be read, so choose it again.",
  failed: ({ message }) => `Not added: it could not be saved (${message}).`,
  replace_failed: ({ cause, message }) =>
    `Not added: ${cause === "storage" ? "this browser ran out of room for it" : `it could not be saved (${message})`}. ${REPLACED_NOTE}`,
  replacing: () => "Not added: the project was being replaced, so add it again once that has finished.",
  left_as_is: (_, name) =>
    `Not added: ${name} now holds a different file, from another save or from a write the browser could not undo, so it was left as it is.`,
  zip: ({ reason, folders }, name) =>
    importOutcomeSentence({ status: "failed", fileName: name, reason, folders }) ?? "Not added.",
};

export const reasonSentence = (reason: UploadReason, name: string): string =>
  (REASON_SENTENCES[reason.kind] as (reason: UploadReason, name: string) => string)(reason, name);

export const uploadNote = (row: UploadRow, landedIn: (path: string) => string): string => {
  switch (row.state) {
    case "waiting":
      return "Waiting";
    case "working":
      return "Adding";
    case "added":
      return `Added to ${landedIn(row.path)}`;
    case "failed":
      return reasonSentence(row.reason, row.name);
  }
};

export const folderTitle = (listing: AssetPaths, folder: string): string => {
  const scripts = scriptsHome({ folders: [...listing.folders] });
  if (isInside(folder, scripts)) {
    return shownPath(folder, scripts) || SCRIPTS_ROOT_LABEL;
  }
  for (const spec of ASSET_TYPES) {
    const root = typeFolder(listing, spec.type);
    if (isInside(folder, root)) {
      return folder === root ? spec.title : folder.slice(root.length + 1);
    }
  }
  return folder || "the project";
};

export const landedIn = (listing: AssetPaths, path: string): string => folderTitle(listing, parentOf(path));

export const storageLeft = async (): Promise<number | null> => {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return estimate?.quota != null && estimate.usage != null ? Math.max(0, estimate.quota - estimate.usage) : null;
  } catch {
    return null;
  }
};
