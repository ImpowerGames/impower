import type { SyncStatus } from "@impower/spark-editor-protocol/src/types";

export type SaveTone = "saved" | "neutral" | "pending" | "warning" | "error";

export type SaveGlyph = "warning" | "error";

export type SaveAction = "menu" | "settings" | "conflict";

export type SaveStatus = {
  text: string;
  tone: SaveTone;
  glyph?: SaveGlyph;
  action: SaveAction;
};

export const DEVICE_STORAGE_COPY = {
  status: "Saved on this device",
  statusTitle: "Where this project is stored",
  marker: "This browser may clear it when space runs low",
  where: "Stored in this browser only.",
  persisted: "This browser keeps it until its site data is cleared.",
  notPersisted:
    "The browser can clear it when space runs low, so keep a copy somewhere safer:",
  keep: "Keep on this device",
  keepDetail: "Ask this browser not to clear it.",
  keepRefused:
    "This browser did not agree to keep it. Export a backup to keep a copy.",
  install: "Install as an app",
  installDetail: "An installed app keeps its work more reliably than a tab.",
  homeScreen: "Add to Home Screen",
  homeScreenDetail:
    "In Safari, tap Share, then Add to Home Screen. Safari keeps a Home Screen app's work; in a tab it can clear it after a week without a visit.",
  saveToDrive: "Save to Google Drive",
  driveDetail: "Keep a copy online and open it on other devices.",
  export: "Export a backup",
  exportDetail: "Download every script and asset as a .zip.",
  exportAction: "Export",
  exportFailed: "The project could not be exported. Try again.",
  remindLater: "Remind me later",
} as const;

export const backupReminderMessage = (days: number, backedUp: boolean) =>
  backedUp
    ? `${days} days since your last backup.`
    : `${days} days and no backup yet.`;

const LOCAL_SAVE_ERRORS: readonly SyncStatus[] = ["load_error", "import_error"];

const failed = (text: string): SaveStatus => ({
  text,
  tone: "error",
  glyph: "error",
  action: "settings",
});

const DRIVE_STATUS: Record<
  Exclude<SyncStatus, "cached" | "synced">,
  SaveStatus
> = {
  loading: { text: "Loading…", tone: "neutral", action: "menu" },
  importing: { text: "Importing…", tone: "neutral", action: "menu" },
  exporting: { text: "Exporting…", tone: "neutral", action: "menu" },
  syncing: { text: "Syncing…", tone: "neutral", action: "menu" },
  unsynced: { text: "Changes not synced", tone: "pending", action: "menu" },
  offline: {
    text: "Offline · will sync when connected",
    tone: "warning",
    action: "menu",
  },
  load_error: failed("Could not load project"),
  import_error: failed("Could not import project"),
  export_error: failed("Could not export project"),
  sync_error: failed("Could not sync project"),
  sync_conflict: {
    text: "Sync conflict",
    tone: "warning",
    glyph: "warning",
    action: "conflict",
  },
};

const MINUTE = 60_000;

export const relativeTime = (from: number, now: number): string => {
  const minutes = Math.floor(Math.max(0, now - from) / MINUTE);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
};

export const savedLocally = (
  status: SyncStatus | undefined,
  local: boolean,
): boolean => !(local && status && LOCAL_SAVE_ERRORS.includes(status));

export const saveStatusOf = (
  status: SyncStatus | undefined,
  local: boolean,
  importProgress?: { loaded: number; total: number } | null,
  syncedAt?: number | null,
  now: number = Date.now(),
): SaveStatus | null => {
  if (importProgress) {
    return {
      text: `Importing ${importProgress.loaded} of ${importProgress.total}…`,
      tone: "pending",
      action: "menu",
    };
  }
  if (!status) {
    return null;
  }
  if (status === "cached") {
    return {
      text: local ? DEVICE_STORAGE_COPY.status : "Draft saved",
      tone: "saved",
      action: "menu",
    };
  }
  if (!savedLocally(status, local)) {
    return {
      text: "Draft not saved",
      tone: "error",
      glyph: "error",
      action: "settings",
    };
  }
  if (status === "synced") {
    return {
      text:
        syncedAt == null
          ? "Saved to Google Drive"
          : `Saved to Google Drive ${relativeTime(syncedAt, now)}`,
      tone: "saved",
      action: "menu",
    };
  }
  return DRIVE_STATUS[status];
};

export const localSaveLabel = (
  status: SyncStatus | undefined,
  local: boolean,
): string =>
  savedLocally(status, local) ? "Saved locally" : "Not saved locally";
