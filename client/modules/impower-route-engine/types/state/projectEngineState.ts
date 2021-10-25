import { WindowState, createWindowState } from "./windowState";
import { DataPanelState, createDataPanelState } from "./dataPanelState";
import { TestState, createTestState } from "./testState";
import { createProjectState, ProjectState } from "./projectState";

export interface ProjectEngineState {
  window: WindowState;
  dataPanel: DataPanelState;
  test: TestState;
  project: ProjectState;
}

export const createProjectEngineState = (): ProjectEngineState => ({
  window: createWindowState(),
  dataPanel: createDataPanelState(),
  test: createTestState(),
  project: createProjectState(),
});
