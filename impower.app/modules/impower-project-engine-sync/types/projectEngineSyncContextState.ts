import {
  createProjectEngineSyncState,
  ProjectEngineSyncState,
} from "./projectEngineSyncState";

export type ProjectEngineSyncContextState = [ProjectEngineSyncState];

export const createProjectEngineSyncContextState =
  (): ProjectEngineSyncContextState => [createProjectEngineSyncState()];
