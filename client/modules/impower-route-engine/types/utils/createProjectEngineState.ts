import { ProjectEngineState } from "../state/projectEngineState";
import { createPanelState } from "./createPanelState";
import { createProjectState } from "./createProjectState";
import { createTestState } from "./createTestState";
import { createWindowState } from "./createWindowState";

export const createProjectEngineState = (): ProjectEngineState => ({
  window: createWindowState(),
  panel: createPanelState(),
  test: createTestState(),
  project: createProjectState(),
});
