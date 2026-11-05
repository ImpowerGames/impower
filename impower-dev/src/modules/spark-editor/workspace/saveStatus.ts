import type { SyncStatus } from "@impower/spark-editor-protocol/src/types";

export type SaveTone = "saved" | "neutral" | "pending" | "warning" | "error";

export type SaveStatus = { text: string; tone: SaveTone };

const LOCAL_SAVE_ERRORS: readonly SyncStatus[] = [
  "load_error",
  "import_error",
  "export_error",
];

const DRIVE_STATUS: Partial<Record<SyncStatus, SaveStatus>> = {
  loading: { text: "Loading...", tone: "neutral" },
  importing: { text: "Importing...", tone: "neutral" },
  exporting: { text: "Exporting...", tone: "neutral" },
  syncing: { text: "Syncing...", tone: "neutral" },
  unsynced: { text: "Unsynced changes", tone: "pending" },
  synced: { text: "Synced online ✓", tone: "neutral" },
  offline: { text: "Cannot sync while offline", tone: "warning" },
  load_error: { text: "Error: Could not load project", tone: "error" },
  import_error: { text: "Error: Could not import project", tone: "error" },
  export_error: { text: "Error: Could not export project", tone: "error" },
  sync_error: { text: "Error: Could not sync project", tone: "error" },
  sync_conflict: { text: "Sync conflict detected", tone: "warning" },
};

export const savedLocally = (
  status: SyncStatus | undefined,
  local: boolean,
): boolean => !(local && status && LOCAL_SAVE_ERRORS.includes(status));

export const saveStatusOf = (
  status: SyncStatus | undefined,
  local: boolean,
  importProgress?: { loaded: number; total: number } | null,
): SaveStatus | null => {
  if (importProgress) {
    return {
      text: `Importing ${importProgress.loaded} of ${importProgress.total}...`,
      tone: "pending",
    };
  }
  if (!status) {
    return null;
  }
  if (status === "cached") {
    return { text: "Draft saved", tone: "saved" };
  }
  if (!savedLocally(status, local)) {
    return { text: "Draft not saved", tone: "error" };
  }
  return DRIVE_STATUS[status] ?? null;
};

export const localSaveLabel = (
  status: SyncStatus | undefined,
  local: boolean,
): string => (savedLocally(status, local) ? "Saved locally" : "Not saved locally");
