import { WorkspaceConstants } from "../workspace/WorkspaceConstants";
import { showSnackbar } from "./snackbar";

export type PersistableStorage = Partial<
  Pick<StorageManager, "persist" | "persisted">
>;

export const STORAGE_NOT_PERSISTED_MESSAGE =
  "This browser may delete your project. Export a backup.";

export const isStoragePersisted = async (
  storage: PersistableStorage | undefined,
): Promise<boolean> => {
  try {
    if (await storage?.persisted?.()) {
      return true;
    }
    return (await storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
};

export const warnIfStorageNotPersisted = async (options: {
  storage: PersistableStorage | undefined;
  projectId: string | undefined;
  exportProject: () => void | Promise<void>;
}): Promise<boolean> => {
  if (await isStoragePersisted(options.storage)) {
    return false;
  }
  const projectId = options.projectId || WorkspaceConstants.LOCAL_PROJECT_ID;
  if (projectId !== WorkspaceConstants.LOCAL_PROJECT_ID) {
    return false;
  }
  showSnackbar({
    message: STORAGE_NOT_PERSISTED_MESSAGE,
    actionLabel: "Export",
    onAction: () => {
      void options.exportProject();
    },
    persistent: true,
  });
  return true;
};
