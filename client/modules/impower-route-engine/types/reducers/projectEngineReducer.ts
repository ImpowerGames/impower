import { ProjectEngineAction } from "../../contexts/projectEngineContextState";
import { PanelAction } from "../actions/panelActions";
import { ProjectAction } from "../actions/projectActions";
import { TestAction } from "../actions/testActions";
import { WindowAction } from "../actions/windowActions";
import { ProjectEngineState } from "../state/projectEngineState";
import { createProjectEngineState } from "../utils/createProjectEngineState";
import { panelReducer } from "./panelReducer";
import { projectReducer } from "./projectReducer";
import { testReducer } from "./testReducer";
import { windowReducer } from "./windowReducer";

export const projectEngineReducer = (
  state = createProjectEngineState(),
  action: ProjectEngineAction
): ProjectEngineState => {
  const window = windowReducer(state.window, action as WindowAction);
  const panel = panelReducer(state.panel, action as PanelAction);
  const test = testReducer(state.test, action as TestAction);
  const project = projectReducer(state.project, action as ProjectAction);

  if (
    window === state.window &&
    panel === state.panel &&
    test === state.test &&
    project === state.project
  ) {
    // Nothing changed, just return the current state
    return state;
  }

  return {
    ...state,
    window,
    panel,
    test,
    project,
  };
};
