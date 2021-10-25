import { createUndoableContext } from "../../impower-undo-redo";
import { ProjectEngineAction } from "../types/reducers/projectEngineReducer";
import { ProjectEngineState } from "../types/state/projectEngineState";

export const ProjectEngineContext = createUndoableContext<
  ProjectEngineState,
  ProjectEngineAction
>();
