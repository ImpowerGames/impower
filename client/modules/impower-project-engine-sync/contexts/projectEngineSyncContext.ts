import React from "react";
import { ProjectEngineSyncContextState } from "../types/projectEngineSyncContextState";

export const ProjectEngineSyncContext =
  React.createContext<ProjectEngineSyncContextState>(undefined);
