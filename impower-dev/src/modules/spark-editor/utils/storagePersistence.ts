import type { ProjectMetadataField } from "@impower/spark-editor-protocol/src/types";
import {
  DEVICE_STORAGE_COPY,
  backupReminderMessage,
} from "../workspace/saveStatus";
import { showSnackbar } from "./snackbar";

export type PersistableStorage = Partial<
  Pick<StorageManager, "persist" | "persisted">
>;

export type PermissionQuery = Partial<Pick<Permissions, "query">>;

export type PersistencePermission =
  | "granted"
  | "prompt"
  | "denied"
  | "unsupported";

export interface StorageProbe {
  persisted: boolean;
  permission: PersistencePermission;
  canPersist: boolean;
}

export type PersistAsk = "none" | "silent" | "on-press";

export const persistAskOf = ({
  persisted,
  permission,
  canPersist,
}: StorageProbe): PersistAsk => {
  if (persisted || !canPersist || permission === "denied") {
    return "none";
  }
  return permission === "granted" ? "silent" : "on-press";
};

const PERMISSION_STATES: readonly string[] = ["granted", "prompt", "denied"];

const permissionOf = async (
  permissions: PermissionQuery | undefined,
): Promise<PersistencePermission> => {
  try {
    const status = await permissions?.query?.({ name: "persistent-storage" });
    const state: string = status?.state ?? "";
    return PERMISSION_STATES.includes(state)
      ? (state as PersistencePermission)
      : "unsupported";
  } catch {
    return "unsupported";
  }
};

const persistedOf = async (
  storage: PersistableStorage | undefined,
): Promise<boolean> => {
  try {
    return (await storage?.persisted?.()) === true;
  } catch {
    return false;
  }
};

export const probeStorage = async (
  storage: PersistableStorage | undefined,
  permissions: PermissionQuery | undefined,
): Promise<StorageProbe> => ({
  persisted: await persistedOf(storage),
  permission: await permissionOf(permissions),
  canPersist: typeof storage?.persist === "function",
});

const askToPersist = async (storage: PersistableStorage | undefined) => {
  try {
    await storage?.persist?.();
  } catch {
    return;
  }
};

export const settleStorage = async (
  storage: PersistableStorage | undefined,
  permissions: PermissionQuery | undefined,
): Promise<StorageProbe> => {
  const probe = await probeStorage(storage, permissions);
  if (persistAskOf(probe) !== "silent") {
    return probe;
  }
  await askToPersist(storage);
  return probeStorage(storage, permissions);
};

export const keepOnDevice = async (
  storage: PersistableStorage | undefined,
  permissions: PermissionQuery | undefined,
): Promise<StorageProbe> => {
  await askToPersist(storage);
  return probeStorage(storage, permissions);
};

export type InstallOffer = "prompt" | "home-screen" | null;

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<unknown>;
}

export const installOfferOf = ({
  installed,
  promptReady,
  homeScreen,
}: {
  installed: boolean;
  promptReady: boolean;
  homeScreen: boolean;
}): InstallOffer => {
  if (installed) {
    return null;
  }
  if (promptReady) {
    return "prompt";
  }
  return homeScreen ? "home-screen" : null;
};

export const DAY_MS = 86_400_000;

export const BACKUP_REMINDER_AFTER_MS = 7 * DAY_MS;

export const BACKUP_REMINDER_SNOOZE_MS = 7 * DAY_MS;

export interface BackupFacts {
  local: boolean;
  persistent: boolean;
  changed: boolean;
  ageMs: number;
  sinceRemindedMs: number | null;
}

export const backupReminderDue = ({
  local,
  persistent,
  changed,
  ageMs,
  sinceRemindedMs,
}: BackupFacts): boolean =>
  local &&
  !persistent &&
  changed &&
  ageMs > BACKUP_REMINDER_AFTER_MS &&
  (sinceRemindedMs === null || sinceRemindedMs >= BACKUP_REMINDER_SNOOZE_MS);

export const BACKUP_REMINDER_CHECK_MS = 60 * 60_000;

export type BackupField = Extract<
  ProjectMetadataField,
  "backedUpAt" | "createdAt" | "remindedAt"
>;

export interface ProjectBackupRecord {
  read: (field: BackupField) => Promise<string>;
  write: (field: BackupField, value: string) => Promise<void>;
  lastEditAt: () => Promise<number | null>;
}

const timeOf = async (
  project: ProjectBackupRecord,
  field: BackupField,
): Promise<number | null> => {
  const time = Number(await project.read(field));
  return Number.isFinite(time) && time > 0 ? time : null;
};

export const recordBackup = async (
  project: ProjectBackupRecord,
  startedAt: number,
) => {
  const backedUpAt = await timeOf(project, "backedUpAt");
  if (backedUpAt !== null && backedUpAt >= startedAt) {
    return;
  }
  await project.write("backedUpAt", String(startedAt));
};

export const exportBackup = async (
  exportProject: () => Promise<boolean>,
): Promise<boolean> => {
  let exported = false;
  try {
    exported = await exportProject();
  } catch {
    exported = false;
  }
  if (!exported) {
    showSnackbar({ message: DEVICE_STORAGE_COPY.exportFailed });
  }
  return exported;
};

export const remindBackupIfDue = async ({
  local,
  persisted,
  project,
  now,
  exportProject,
  visible,
}: {
  local: boolean;
  persisted: boolean;
  project: ProjectBackupRecord;
  now: number;
  exportProject: () => Promise<boolean>;
  visible: () => boolean;
}): Promise<boolean> => {
  if (!local) {
    return false;
  }
  let createdAt = await timeOf(project, "createdAt");
  if (createdAt === null) {
    createdAt = now;
    await project.write("createdAt", String(now));
  }
  const backedUpAt = await timeOf(project, "backedUpAt");
  const remindedAt = await timeOf(project, "remindedAt");
  const since = backedUpAt ?? createdAt;
  const due = backupReminderDue({
    local,
    persistent: persisted,
    changed: ((await project.lastEditAt()) ?? 0) >= since,
    ageMs: now - since,
    sinceRemindedMs: remindedAt === null ? null : now - remindedAt,
  });
  if (!due || !visible()) {
    return false;
  }
  showSnackbar({
    message: backupReminderMessage(
      Math.floor((now - since) / DAY_MS),
      backedUpAt !== null,
    ),
    actionLabel: DEVICE_STORAGE_COPY.exportAction,
    dismissLabel: DEVICE_STORAGE_COPY.remindLater,
    onAction: () => {
      void exportBackup(exportProject);
    },
  });
  await project.write("remindedAt", String(now));
  return true;
};
