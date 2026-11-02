import { WorkspaceConstants } from "../workspace/WorkspaceConstants";
import { dismissSnackbar, showSnackbar, type Snackbar } from "./snackbar";

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

export const STORAGE_EXPORT_FAILED_MESSAGE =
  "The project could not be exported. Try again.";

export const warnIfStorageNotPersisted = async (options: {
  storage: PersistableStorage | undefined;
  projectId: string | undefined;
  exportProject: () => Promise<boolean>;
}): Promise<boolean> => {
  if (await isStoragePersisted(options.storage)) {
    return false;
  }
  const projectId = options.projectId || WorkspaceConstants.LOCAL_PROJECT_ID;
  if (projectId !== WorkspaceConstants.LOCAL_PROJECT_ID) {
    return false;
  }
  let exporting = false;
  const exportBackup = async () => {
    if (exporting) {
      return;
    }
    exporting = true;
    let exported = false;
    try {
      exported = await options.exportProject();
    } catch {
      exported = false;
    }
    exporting = false;
    if (exported) {
      dismissSnackbar(warning);
    } else {
      showSnackbar({ message: STORAGE_EXPORT_FAILED_MESSAGE });
    }
  };
  const warning: Snackbar = {
    message: STORAGE_NOT_PERSISTED_MESSAGE,
    actionLabel: "Export",
    onAction: () => {
      void exportBackup();
    },
    persistent: true,
  };
  showSnackbar(warning);
  return true;
};
