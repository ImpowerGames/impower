export enum ProjectEngineSyncStatus {
  Loading = "Loading",
  WillNotSync = "WillNotSync",
  Saving = "Saving",
  Offline = "Offline",
  Online = "Online",
  SyncError = "SyncError",
}

export interface ProjectEngineSyncState {
  isSynced: boolean;
  syncStatus: ProjectEngineSyncStatus;
  syncStatusMessage: string;
}

export const createProjectEngineSyncState = (): ProjectEngineSyncState => ({
  isSynced: false,
  syncStatus: ProjectEngineSyncStatus.WillNotSync,
  syncStatusMessage: "",
});
