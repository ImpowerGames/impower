import { PanelState } from "./panelState";
import { ProjectState } from "./projectState";
import { TestState } from "./testState";
import { WindowState } from "./windowState";

export interface ProjectEngineState {
  window: WindowState;
  panel: PanelState;
  test: TestState;
  project: ProjectState;
}
