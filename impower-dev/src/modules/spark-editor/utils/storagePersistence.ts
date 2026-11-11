import { DEVICE_STORAGE_COPY } from "../workspace/saveStatus";
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
