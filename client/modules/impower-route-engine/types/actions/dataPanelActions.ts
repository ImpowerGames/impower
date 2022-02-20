import {
  ContainerReference,
  ItemReference,
  ItemSectionType,
  ItemType,
  SetupSectionType,
} from "../../../impower-game/data";
import { FountainParseResult } from "../../../impower-script-parser";
import {
  ContainerArrangement,
  DataInteractionType,
  DataPanelType,
  DataWindowType,
} from "../state/dataPanelState";

export const DATA_PANEL_OPEN = "DATA_PANEL_OPEN";
export interface DataPanelOpenAction {
  type: typeof DATA_PANEL_OPEN;
  payload: {
    windowType: DataWindowType;
    panelType: DataPanelType;
  };
}
export const dataPanelOpen = (
  windowType: DataWindowType,
  panelType: DataPanelType
): DataPanelOpenAction => {
  return {
    type: DATA_PANEL_OPEN,
    payload: { windowType, panelType },
  };
};

export const DATA_PANEL_CHANGE_INTERACTION = "DATA_PANEL_CHANGE_INTERACTION";
export interface DataPanelChangeInteractionAction {
  type: typeof DATA_PANEL_CHANGE_INTERACTION;
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    reference: ContainerReference | ItemReference | string;
  };
}
export const dataPanelChangeInteraction = (
  windowType: DataWindowType,
  interactionType: DataInteractionType,
  panelType: DataPanelType,
  reference: ContainerReference | ItemReference | string
): DataPanelChangeInteractionAction => {
  return {
    type: DATA_PANEL_CHANGE_INTERACTION,
    payload: { windowType, interactionType, panelType, reference },
  };
};

export const DATA_PANEL_TOGGLE_INTERACTION = "DATA_PANEL_TOGGLE_INTERACTION";
export interface DataPanelToggleInteractionAction {
  type: typeof DATA_PANEL_TOGGLE_INTERACTION;
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    reference: ContainerReference | ItemReference | string;
  };
}
export const dataPanelToggleInteraction = (
  windowType: DataWindowType,
  interactionType: DataInteractionType,
  panelType: DataPanelType,
  reference: ContainerReference | ItemReference | string
): DataPanelToggleInteractionAction => {
  return {
    type: DATA_PANEL_TOGGLE_INTERACTION,
    payload: { windowType, interactionType, panelType, reference },
  };
};

export const DATA_PANEL_MULTI_INTERACTION = "DATA_PANEL_MULTI_INTERACTION";
export interface DataPanelMultiInteractionAction {
  type: typeof DATA_PANEL_MULTI_INTERACTION;
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    allReferences: (ContainerReference | ItemReference | string)[];
    newReference: ContainerReference | ItemReference | string;
  };
}
export const dataPanelMultiInteraction = (
  windowType: DataWindowType,
  interactionType: DataInteractionType,
  panelType: DataPanelType,
  allReferences: (ContainerReference | ItemReference | string)[],
  newReference: ContainerReference | ItemReference | string
): DataPanelMultiInteractionAction => {
  return {
    type: DATA_PANEL_MULTI_INTERACTION,
    payload: {
      windowType,
      interactionType,
      panelType,
      allReferences,
      newReference,
    },
  };
};

export const DATA_PANEL_TOGGLE_ALL_INTERACTION =
  "DATA_PANEL_TOGGLE_ALL_INTERACTION";
export interface DataPanelToggleAllInteractionAction {
  type: typeof DATA_PANEL_TOGGLE_ALL_INTERACTION;
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    references: (ContainerReference | ItemReference | string)[];
  };
}
export function dataPanelToggleAllInteraction(
  windowType: DataWindowType,
  interactionType: DataInteractionType,
  panelType: DataPanelType,
  references: (ContainerReference | ItemReference | string)[]
): DataPanelToggleAllInteractionAction {
  return {
    type: DATA_PANEL_TOGGLE_ALL_INTERACTION,
    payload: { windowType, interactionType, panelType, references },
  };
}

export const DATA_PANEL_ADD_INTERACTION = "DATA_PANEL_ADD_INTERACTION";
export interface DataPanelAddInteractionAction {
  type: typeof DATA_PANEL_ADD_INTERACTION;
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    references: (ContainerReference | ItemReference | string)[];
  };
}
export const dataPanelAddInteraction = (
  windowType: DataWindowType,
  interactionType: DataInteractionType,
  panelType: DataPanelType,
  references: (ContainerReference | ItemReference | string)[]
): DataPanelAddInteractionAction => {
  return {
    type: DATA_PANEL_ADD_INTERACTION,
    payload: { windowType, interactionType, panelType, references },
  };
};

export const DATA_PANEL_REMOVE_INTERACTION = "DATA_PANEL_REMOVE_INTERACTION";
export interface DataPanelRemoveInteractionAction {
  type: typeof DATA_PANEL_REMOVE_INTERACTION;
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    references: (ContainerReference | ItemReference | string)[];
  };
}
export const dataPanelRemoveInteraction = (
  windowType: DataWindowType,
  interactionType: DataInteractionType,
  panelType: DataPanelType,
  references: (ContainerReference | ItemReference | string)[]
): DataPanelRemoveInteractionAction => {
  return {
    type: DATA_PANEL_REMOVE_INTERACTION,
    payload: { windowType, interactionType, panelType, references },
  };
};

export const DATA_PANEL_SET_INTERACTION = "DATA_PANEL_SET_INTERACTION";
export interface DataPanelSetInteractionAction {
  type: typeof DATA_PANEL_SET_INTERACTION;
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    references: (ContainerReference | ItemReference | string)[];
  };
}
export const dataPanelSetInteraction = (
  windowType: DataWindowType,
  interactionType: DataInteractionType,
  panelType: DataPanelType,
  references: (ContainerReference | ItemReference | string)[]
): DataPanelSetInteractionAction => {
  return {
    type: DATA_PANEL_SET_INTERACTION,
    payload: { windowType, interactionType, panelType, references },
  };
};

export const DATA_PANEL_SET_PARENT_CONTAINER_ARRANGEMENT =
  "DATA_PANEL_SET_PARENT_CONTAINER_ARRANGEMENT";
export interface DataPanelSetParentContainerArrangementAction {
  type: typeof DATA_PANEL_SET_PARENT_CONTAINER_ARRANGEMENT;
  payload: { windowType: DataWindowType; arrangement: ContainerArrangement };
}
export const dataPanelSetParentContainerArrangement = (
  windowType: DataWindowType,
  arrangement: ContainerArrangement
): DataPanelSetParentContainerArrangementAction => {
  return {
    type: DATA_PANEL_SET_PARENT_CONTAINER_ARRANGEMENT,
    payload: { windowType, arrangement },
  };
};

export const DATA_PANEL_SET_SCRIPTING = "DATA_PANEL_SET_SCRIPTING";
export interface DataPanelSetScriptingAction {
  type: typeof DATA_PANEL_SET_SCRIPTING;
  payload: { windowType: DataWindowType; scripting: boolean };
}
export const dataPanelSetScripting = (
  windowType: DataWindowType,
  scripting: boolean
): DataPanelSetScriptingAction => {
  return {
    type: DATA_PANEL_SET_SCRIPTING,
    payload: { windowType, scripting },
  };
};

export const DATA_PANEL_SET_CURSOR = "DATA_PANEL_SET_CURSOR";
export interface DataPanelSetCursorAction {
  type: typeof DATA_PANEL_SET_CURSOR;
  payload: {
    windowType: DataWindowType;
    cursor: {
      from: number;
      to: number;
    };
  };
}
export const dataPanelSetCursor = (
  windowType: DataWindowType,
  cursor: {
    from: number;
    to: number;
  }
): DataPanelSetCursorAction => {
  return {
    type: DATA_PANEL_SET_CURSOR,
    payload: { windowType, cursor },
  };
};

export const DATA_PANEL_SET_PARSE_RESULT = "DATA_PANEL_PARSE_RESULT";
export interface DataPanelSetParseResultAction {
  type: typeof DATA_PANEL_SET_PARSE_RESULT;
  payload: {
    windowType: DataWindowType;
    parseResult: FountainParseResult;
  };
}
export const dataPanelSetParseResult = (
  windowType: DataWindowType,
  parseResult: FountainParseResult
): DataPanelSetParseResultAction => {
  return {
    type: DATA_PANEL_SET_PARSE_RESULT,
    payload: { windowType, parseResult },
  };
};

export const DATA_PANEL_CHANGE_ITEM_SECTION = "DATA_PANEL_CHANGE_ITEM_SECTION";
export interface DataPanelChangeItemSectionAction {
  type: typeof DATA_PANEL_CHANGE_ITEM_SECTION;
  payload: {
    windowType: DataWindowType;
    section: ItemType | ItemSectionType | SetupSectionType;
  };
}
export const dataPanelChangeItemSection = (
  windowType: DataWindowType,
  section: ItemType | ItemSectionType | SetupSectionType
): DataPanelChangeItemSectionAction => {
  return {
    type: DATA_PANEL_CHANGE_ITEM_SECTION,
    payload: { windowType, section },
  };
};

export const DATA_PANEL_SET_LAST_ADDED_TYPE_ID =
  "DATA_PANEL_SET_LAST_ADDED_TYPE_ID";
export interface DataPanelSetLastAddedTypeIdAction {
  type: typeof DATA_PANEL_SET_LAST_ADDED_TYPE_ID;
  payload: {
    windowType: DataWindowType;
    refType: ItemType;
    refTypeId: string;
  };
}
export const dataPanelSetLastAddedTypeId = (
  windowType: DataWindowType,
  refType: ItemType,
  refTypeId: string
): DataPanelSetLastAddedTypeIdAction => {
  return {
    type: DATA_PANEL_SET_LAST_ADDED_TYPE_ID,
    payload: { windowType, refType, refTypeId },
  };
};

export const DATA_PANEL_SEARCH = "DATA_PANEL_SEARCH";
export interface DataPanelSearchAction {
  type: typeof DATA_PANEL_SEARCH;
  payload: {
    windowType: DataWindowType;
    panelType: DataPanelType;
    search?: string;
  };
}
export const dataPanelSearch = (
  windowType: DataWindowType,
  panelType: DataPanelType,
  search?: string
): DataPanelSearchAction => {
  return {
    type: DATA_PANEL_SEARCH,
    payload: { windowType, panelType, search },
  };
};

export const DATA_PANEL_SET_PANE_SIZE = "DATA_PANEL_SET_PANE_SIZE";
export interface DataPanelSetPaneSizeAction {
  type: typeof DATA_PANEL_SET_PANE_SIZE;
  payload: {
    paneSize: number | string;
  };
}
export const dataPanelSetPaneSize = (
  paneSize: number | string
): DataPanelSetPaneSizeAction => {
  return {
    type: DATA_PANEL_SET_PANE_SIZE,
    payload: { paneSize },
  };
};

export const DATA_PANEL_SET_SCROLL_PARENT = "DATA_PANEL_SET_SCROLL_PARENT";
export interface DataPanelSetScrollParentAction {
  type: typeof DATA_PANEL_SET_SCROLL_PARENT;
  payload: {
    scrollParent: HTMLElement;
  };
}
export const dataPanelSetScrollParent = (
  scrollParent: HTMLElement
): DataPanelSetScrollParentAction => {
  return {
    type: DATA_PANEL_SET_SCROLL_PARENT,
    payload: { scrollParent },
  };
};

export const DATA_PANEL_SET_SCROLL_Y = "DATA_PANEL_SET_SCROLL_Y";
export interface DataPanelSetScrollYAction {
  type: typeof DATA_PANEL_SET_SCROLL_Y;
  payload: {
    windowType: DataWindowType;
    panelType: DataPanelType;
    scrollId: string;
    scrollY: number;
  };
}
export const dataPanelSetScrollY = (
  windowType: DataWindowType,
  panelType: DataPanelType,
  scrollId: string,
  scrollY: number
): DataPanelSetScrollYAction => {
  return {
    type: DATA_PANEL_SET_SCROLL_Y,
    payload: { windowType, panelType, scrollId, scrollY },
  };
};

export const DATA_PANEL_SET_SCROLL_X = "DATA_PANEL_SET_SCROLL_X";
export interface DataPanelSetScrollXAction {
  type: typeof DATA_PANEL_SET_SCROLL_X;
  payload: {
    windowType: DataWindowType;
    panelType: DataPanelType;
    scrollId: string;
    scrollX: number;
  };
}
export const dataPanelSetScrollX = (
  windowType: DataWindowType,
  panelType: DataPanelType,
  scrollId: string,
  scrollX: number
): DataPanelSetScrollXAction => {
  return {
    type: DATA_PANEL_SET_SCROLL_X,
    payload: { windowType, panelType, scrollId, scrollX },
  };
};

export const DATA_PANEL_INSPECT = "DATA_PANEL_INSPECT";
export interface DataPanelInspectAction {
  type: typeof DATA_PANEL_INSPECT;
  payload: {
    windowType: DataWindowType;
    panelType: DataPanelType;
    targetId: string;
    propertyPaths?: string[];
  };
}
export const dataPanelInspect = (
  windowType: DataWindowType,
  panelType: DataPanelType,
  targetId: string,
  propertyPaths?: string[]
): DataPanelInspectAction => {
  return {
    type: DATA_PANEL_INSPECT,
    payload: { windowType, panelType, targetId, propertyPaths },
  };
};

export const DATA_PANEL_SET_ERRORS = "DATA_PANEL_SET_ERRORS";
export interface DataPanelSetErrorsAction {
  type: typeof DATA_PANEL_SET_ERRORS;
  payload: {
    windowType: DataWindowType;
    panelType: DataPanelType;
    errors: { [propertyPath: string]: string };
  };
}
export const dataPanelSetErrors = (
  windowType: DataWindowType,
  panelType: DataPanelType,
  errors: { [propertyPath: string]: string }
): DataPanelSetErrorsAction => {
  return {
    type: DATA_PANEL_SET_ERRORS,
    payload: { windowType, panelType, errors },
  };
};

export const DATA_PANEL_SUBMIT = "DATA_PANEL_SUBMIT";
export interface DataPanelSubmitAction {
  type: typeof DATA_PANEL_SUBMIT;
  payload: {
    windowType: DataWindowType;
    panelType: DataPanelType;
    submitting: boolean;
  };
}
export const dataPanelSubmit = (
  windowType: DataWindowType,
  panelType: DataPanelType,
  submitting: boolean
): DataPanelSubmitAction => {
  return {
    type: DATA_PANEL_SUBMIT,
    payload: { windowType, panelType, submitting },
  };
};

export type DataPanelAction =
  | DataPanelOpenAction
  | DataPanelChangeInteractionAction
  | DataPanelToggleInteractionAction
  | DataPanelMultiInteractionAction
  | DataPanelToggleAllInteractionAction
  | DataPanelAddInteractionAction
  | DataPanelRemoveInteractionAction
  | DataPanelSetInteractionAction
  | DataPanelSetScriptingAction
  | DataPanelSetCursorAction
  | DataPanelSetParseResultAction
  | DataPanelSetParentContainerArrangementAction
  | DataPanelChangeItemSectionAction
  | DataPanelSetLastAddedTypeIdAction
  | DataPanelSearchAction
  | DataPanelSetPaneSizeAction
  | DataPanelSetScrollParentAction
  | DataPanelSetScrollYAction
  | DataPanelSetScrollXAction
  | DataPanelInspectAction
  | DataPanelSetErrorsAction
  | DataPanelSubmitAction;
