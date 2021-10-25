import { DataStoreErrorCode } from "../../impower-data-store";
import { ProjectEngineSyncStatus } from "./projectEngineSyncState";

export const projectEngineSyncStatusInfo: {
  [type in ProjectEngineSyncStatus]: string;
} = {
  Loading: "Loading...",
  WillNotSync: "",
  Saving: "Saving...",
  Offline: "Saved Offline",
  Online: "Synced Online",
  SyncError: "Sync Error",
};

export const getEngineSyncStatus = (
  isLoaded: boolean,
  isSignedIn: boolean,
  isAnonymous: boolean,
  isConnected: boolean,
  isSaving: boolean,
  isSynced: boolean
): ProjectEngineSyncStatus => {
  if (!isLoaded) {
    return ProjectEngineSyncStatus.Loading;
  }
  if (isSignedIn === false || isAnonymous) {
    return ProjectEngineSyncStatus.WillNotSync;
  }
  if (!isConnected) {
    return ProjectEngineSyncStatus.Offline;
  }
  if (isSaving) {
    return ProjectEngineSyncStatus.Saving;
  }
  if (isSynced) {
    return ProjectEngineSyncStatus.Online;
  }
  return ProjectEngineSyncStatus.SyncError;
};

export enum ProjectEngineSyncInstructionType {
  Temporary = "Temporary",
}

export interface ProjectEngineSyncInstructionInfo {
  message: string;
  button: string;
}

export const projectEngineSyncInstructions: {
  [type in ProjectEngineSyncInstructionType]: ProjectEngineSyncInstructionInfo;
} = {
  Temporary: {
    message:
      "Editing a temporary project. Changes will not be saved. Sign up to permanently save this project.",
    button: "Sign Up",
  },
};

export const getProjectEngineSyncErrorTitle = (
  error: DataStoreErrorCode
): string => {
  switch (error) {
    default:
      return "";
  }
};

export const getProjectEngineSyncErrorMessage = (
  error: DataStoreErrorCode
): string => {
  switch (error) {
    default:
      return "";
  }
};
