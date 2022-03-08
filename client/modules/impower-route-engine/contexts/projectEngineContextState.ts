import { Dispatch } from "react";
import { PanelAction } from "../types/actions/panelActions";
import { ProjectAction } from "../types/actions/projectActions";
import { TestAction } from "../types/actions/testActions";
import { WindowAction } from "../types/actions/windowActions";
import { ProjectEngineState } from "../types/state/projectEngineState";

export type ProjectEngineAction =
  | WindowAction
  | PanelAction
  | TestAction
  | ProjectAction;

export type ProjectEngineContextState = [
  ProjectEngineState,
  Dispatch<ProjectEngineAction>
];
