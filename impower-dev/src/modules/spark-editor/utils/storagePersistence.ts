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
  "backedUpAt" | "backedUpFiles" | "createdAt" | "remindedAt"
>;

export interface ProjectFileFacts {
  path: string;
  size: number;
  text?: string;
}

export const projectFingerprint = (files: readonly ProjectFileFacts[]) => {
  let hash = 0x811c9dc5;
  const feed = (value: string) => {
    for (let i = 0; i < value.length; i++) {
      hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193) >>> 0;
    }
    hash = Math.imul(hash ^ 0xffff, 0x01000193) >>> 0;
  };
  const sorted = [...files].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  for (const { path, size, text } of sorted) {
    feed(path);
    feed(String(size));
    feed(text ?? "");
  }
  return `${files.length}:${hash.toString(16)}`;
};

export interface ProjectBackupRecord {
  read: (field: BackupField) => Promise<string>;
  write: (field: BackupField, value: string) => Promise<void>;
  fingerprint: () => Promise<string>;
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
  now: number,
) => {
  await project.write("backedUpFiles", await project.fingerprint());
  await project.write("backedUpAt", String(now));
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
}: {
  local: boolean;
  persisted: boolean;
  project: ProjectBackupRecord;
  now: number;
  exportProject: () => Promise<boolean>;
}): Promise<boolean> => {
  if (!local) {
    return false;
  }
  const fingerprint = await project.fingerprint();
  let createdAt = await timeOf(project, "createdAt");
  if (createdAt === null) {
    createdAt = now;
    await project.write("createdAt", String(now));
  }
  const baseline = await project.read("backedUpFiles");
  if (!baseline) {
    await project.write("backedUpFiles", fingerprint);
  }
  const backedUpAt = await timeOf(project, "backedUpAt");
  const remindedAt = await timeOf(project, "remindedAt");
  const since = backedUpAt ?? createdAt;
  const due = backupReminderDue({
    local,
    persistent: persisted,
    changed: !!baseline && baseline !== fingerprint,
    ageMs: now - since,
    sinceRemindedMs: remindedAt === null ? null : now - remindedAt,
  });
  if (!due) {
    return false;
  }
  await project.write("remindedAt", String(now));
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
  return true;
};
