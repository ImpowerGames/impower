import { UndoRedoConfig } from "../../../impower-undo-redo";
import { DataPanelAction } from "../actions/dataPanelActions";
import {
  ProjectAction,
  PROJECT_CHANGE_DOCUMENT,
  PROJECT_CHANGE_INSTANCE_DATA,
  PROJECT_CHANGE_SCRIPT,
  PROJECT_INSERT_DATA,
  PROJECT_REMOVE_DATA,
  PROJECT_UPDATE_DATA,
} from "../actions/projectActions";
import { TestAction } from "../actions/testActions";
import { WindowAction } from "../actions/windowActions";
import {
  createProjectEngineState,
  ProjectEngineState,
} from "../state/projectEngineState";
import { dataPanelReducer } from "./dataPanelReducer";
import { projectReducer } from "./projectReducer";
import { testReducer } from "./testReducer";
import { windowReducer } from "./windowReducer";

export type ProjectEngineAction =
  | WindowAction
  | DataPanelAction
  | TestAction
  | ProjectAction;

export const projectEngineReducer = (
  state = createProjectEngineState(),
  action: ProjectEngineAction
): ProjectEngineState => {
  const window = windowReducer(state.window, action as WindowAction);
  const dataPanel = dataPanelReducer(
    state.dataPanel,
    action as DataPanelAction
  );
  const test = testReducer(state.test, action as TestAction);
  const project = projectReducer(state.project, action as ProjectAction);

  if (
    window === state.window &&
    dataPanel === state.dataPanel &&
    test === state.test &&
    project === state.project
  ) {
    // Nothing changed, just return the current state
    return state;
  }

  return {
    ...state,
    window,
    dataPanel,
    test,
    project,
  };
};

export const projectEngineUndoRedoConfig: UndoRedoConfig = {
  limit: 10, // A value of "3" would include the present value and 2 undoable values.
  undoableActionTypes: [
    PROJECT_UPDATE_DATA,
    PROJECT_INSERT_DATA,
    PROJECT_REMOVE_DATA,
    PROJECT_CHANGE_SCRIPT,
    PROJECT_CHANGE_DOCUMENT,
    PROJECT_CHANGE_INSTANCE_DATA,
  ],
};
