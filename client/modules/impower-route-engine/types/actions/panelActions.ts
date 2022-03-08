import {
  ContainerReference,
  ItemReference,
  ItemSectionType,
  ItemType,
  SetupSectionType,
} from "../../../impower-game/data";
import { SerializableEditorState } from "../../../impower-script-editor";
import {
  ContainerArrangement,
  PanelInteractionType,
  PanelType,
} from "../state/panelState";
import { WindowType } from "../state/windowState";

export const PANEL_OPEN = "PANEL_OPEN";
export interface PanelOpenAction {
  type: typeof PANEL_OPEN;
  payload: {
    windowType: WindowType;
    panelType: PanelType;
  };
}
export const panelOpen = (
  windowType: WindowType,
  panelType: PanelType
): PanelOpenAction => {
  return {
    type: PANEL_OPEN,
    payload: { windowType, panelType },
  };
};

export const PANEL_CHANGE_INTERACTION = "PANEL_CHANGE_INTERACTION";
export interface PanelChangeInteractionAction {
  type: typeof PANEL_CHANGE_INTERACTION;
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    panelType: PanelType;
    reference: ContainerReference | ItemReference | string;
  };
}
export const panelChangeInteraction = (
  windowType: WindowType,
  interactionType: PanelInteractionType,
  panelType: PanelType,
  reference: ContainerReference | ItemReference | string
): PanelChangeInteractionAction => {
  return {
    type: PANEL_CHANGE_INTERACTION,
    payload: { windowType, interactionType, panelType, reference },
  };
};

export const PANEL_TOGGLE_INTERACTION = "PANEL_TOGGLE_INTERACTION";
export interface PanelToggleInteractionAction {
  type: typeof PANEL_TOGGLE_INTERACTION;
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    panelType: PanelType;
    reference: ContainerReference | ItemReference | string;
  };
}
export const panelToggleInteraction = (
  windowType: WindowType,
  interactionType: PanelInteractionType,
  panelType: PanelType,
  reference: ContainerReference | ItemReference | string
): PanelToggleInteractionAction => {
  return {
    type: PANEL_TOGGLE_INTERACTION,
    payload: { windowType, interactionType, panelType, reference },
  };
};

export const PANEL_MULTI_INTERACTION = "PANEL_MULTI_INTERACTION";
export interface PanelMultiInteractionAction {
  type: typeof PANEL_MULTI_INTERACTION;
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    panelType: PanelType;
    allReferences: (ContainerReference | ItemReference | string)[];
    newReference: ContainerReference | ItemReference | string;
  };
}
export const panelMultiInteraction = (
  windowType: WindowType,
  interactionType: PanelInteractionType,
  panelType: PanelType,
  allReferences: (ContainerReference | ItemReference | string)[],
  newReference: ContainerReference | ItemReference | string
): PanelMultiInteractionAction => {
  return {
    type: PANEL_MULTI_INTERACTION,
    payload: {
      windowType,
      interactionType,
      panelType,
      allReferences,
      newReference,
    },
  };
};

export const PANEL_TOGGLE_ALL_INTERACTION = "PANEL_TOGGLE_ALL_INTERACTION";
export interface PanelToggleAllInteractionAction {
  type: typeof PANEL_TOGGLE_ALL_INTERACTION;
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    panelType: PanelType;
    references: (ContainerReference | ItemReference | string)[];
  };
}
export function panelToggleAllInteraction(
  windowType: WindowType,
  interactionType: PanelInteractionType,
  panelType: PanelType,
  references: (ContainerReference | ItemReference | string)[]
): PanelToggleAllInteractionAction {
  return {
    type: PANEL_TOGGLE_ALL_INTERACTION,
    payload: { windowType, interactionType, panelType, references },
  };
}

export const PANEL_ADD_INTERACTION = "PANEL_ADD_INTERACTION";
export interface PanelAddInteractionAction {
  type: typeof PANEL_ADD_INTERACTION;
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    panelType: PanelType;
    references: (ContainerReference | ItemReference | string)[];
  };
}
export const panelAddInteraction = (
  windowType: WindowType,
  interactionType: PanelInteractionType,
  panelType: PanelType,
  references: (ContainerReference | ItemReference | string)[]
): PanelAddInteractionAction => {
  return {
    type: PANEL_ADD_INTERACTION,
    payload: { windowType, interactionType, panelType, references },
  };
};

export const PANEL_REMOVE_INTERACTION = "PANEL_REMOVE_INTERACTION";
export interface PanelRemoveInteractionAction {
  type: typeof PANEL_REMOVE_INTERACTION;
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    panelType: PanelType;
    references: (ContainerReference | ItemReference | string)[];
  };
}
export const panelRemoveInteraction = (
  windowType: WindowType,
  interactionType: PanelInteractionType,
  panelType: PanelType,
  references: (ContainerReference | ItemReference | string)[]
): PanelRemoveInteractionAction => {
  return {
    type: PANEL_REMOVE_INTERACTION,
    payload: { windowType, interactionType, panelType, references },
  };
};

export const PANEL_SET_INTERACTION = "PANEL_SET_INTERACTION";
export interface PanelSetInteractionAction {
  type: typeof PANEL_SET_INTERACTION;
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    panelType: PanelType;
    references: (ContainerReference | ItemReference | string)[];
  };
}
export const panelSetInteraction = (
  windowType: WindowType,
  interactionType: PanelInteractionType,
  panelType: PanelType,
  references: (ContainerReference | ItemReference | string)[]
): PanelSetInteractionAction => {
  return {
    type: PANEL_SET_INTERACTION,
    payload: { windowType, interactionType, panelType, references },
  };
};

export const PANEL_SET_PARENT_CONTAINER_ARRANGEMENT =
  "PANEL_SET_PARENT_CONTAINER_ARRANGEMENT";
export interface PanelSetParentContainerArrangementAction {
  type: typeof PANEL_SET_PARENT_CONTAINER_ARRANGEMENT;
  payload: { windowType: WindowType; arrangement: ContainerArrangement };
}
export const panelSetParentContainerArrangement = (
  windowType: WindowType,
  arrangement: ContainerArrangement
): PanelSetParentContainerArrangementAction => {
  return {
    type: PANEL_SET_PARENT_CONTAINER_ARRANGEMENT,
    payload: { windowType, arrangement },
  };
};

export const PANEL_SET_SCRIPTING = "PANEL_SET_SCRIPTING";
export interface PanelSetScriptingAction {
  type: typeof PANEL_SET_SCRIPTING;
  payload: { windowType: WindowType; scripting: boolean };
}
export const panelSetScripting = (
  windowType: WindowType,
  scripting: boolean
): PanelSetScriptingAction => {
  return {
    type: PANEL_SET_SCRIPTING,
    payload: { windowType, scripting },
  };
};

export const PANEL_SET_CURSOR = "PANEL_SET_CURSOR";
export interface PanelSetCursorAction {
  type: typeof PANEL_SET_CURSOR;
  payload: {
    windowType: WindowType;
    cursor: {
      anchor: number;
      head: number;
      fromLine: number;
      toLine: number;
    };
  };
}
export const panelSetCursor = (
  windowType: WindowType,
  cursor: {
    anchor: number;
    head: number;
    fromLine: number;
    toLine: number;
  }
): PanelSetCursorAction => {
  return {
    type: PANEL_SET_CURSOR,
    payload: { windowType, cursor },
  };
};

export const PANEL_SET_SCROLL_TOP_LINE = "PANEL_SET_SCROLL_TOP_LINE";
export interface PanelSetScrollTopLineAction {
  type: typeof PANEL_SET_SCROLL_TOP_LINE;
  payload: {
    windowType: WindowType;
    scrollTopLine: number;
  };
}
export const panelSetScrollTopLine = (
  windowType: WindowType,
  scrollTopLine: number
): PanelSetScrollTopLineAction => {
  return {
    type: PANEL_SET_SCROLL_TOP_LINE,
    payload: { windowType, scrollTopLine },
  };
};

export const PANEL_SAVE_EDITOR_STATE = "PANEL_SAVE_EDITOR_STATE";
export interface PanelSaveEditorStateAction {
  type: typeof PANEL_SAVE_EDITOR_STATE;
  payload: { windowType: WindowType; editorState: SerializableEditorState };
}
export const panelSaveEditorState = (
  windowType: WindowType,
  editorState: SerializableEditorState
): PanelSaveEditorStateAction => {
  return {
    type: PANEL_SAVE_EDITOR_STATE,
    payload: { windowType, editorState },
  };
};

export const PANEL_CHANGE_EDITOR_STATE = "PANEL_CHANGE_EDITOR_STATE";
export interface PanelChangeEditorStateAction {
  type: typeof PANEL_CHANGE_EDITOR_STATE;
  payload: {
    windowType: WindowType;
    editorAction: { action: "undo" | "redo" };
  };
}
export const panelChangeEditorState = (
  windowType: WindowType,
  editorAction: { action: "undo" | "redo" }
): PanelChangeEditorStateAction => {
  return {
    type: PANEL_CHANGE_EDITOR_STATE,
    payload: { windowType, editorAction },
  };
};

export const PANEL_CHANGE_ITEM_SECTION = "PANEL_CHANGE_ITEM_SECTION";
export interface PanelChangeItemSectionAction {
  type: typeof PANEL_CHANGE_ITEM_SECTION;
  payload: {
    windowType: WindowType;
    section: ItemType | ItemSectionType | SetupSectionType;
  };
}
export const panelChangeItemSection = (
  windowType: WindowType,
  section: ItemType | ItemSectionType | SetupSectionType
): PanelChangeItemSectionAction => {
  return {
    type: PANEL_CHANGE_ITEM_SECTION,
    payload: { windowType, section },
  };
};

export const PANEL_SET_LAST_ADDED_TYPE_ID = "PANEL_SET_LAST_ADDED_TYPE_ID";
export interface PanelSetLastAddedTypeIdAction {
  type: typeof PANEL_SET_LAST_ADDED_TYPE_ID;
  payload: {
    windowType: WindowType;
    refType: ItemType;
    refTypeId: string;
  };
}
export const panelSetLastAddedTypeId = (
  windowType: WindowType,
  refType: ItemType,
  refTypeId: string
): PanelSetLastAddedTypeIdAction => {
  return {
    type: PANEL_SET_LAST_ADDED_TYPE_ID,
    payload: { windowType, refType, refTypeId },
  };
};

export const PANEL_SEARCH = "PANEL_SEARCH";
export interface PanelSearchAction {
  type: typeof PANEL_SEARCH;
  payload: {
    windowType: WindowType;
    panelType: PanelType;
    searchQuery?: {
      search: string;
      caseSensitive?: boolean;
      regexp?: boolean;
      replace?: string;
      action?:
        | "search"
        | "find_next"
        | "find_previous"
        | "replace"
        | "replace_all";
    };
  };
}
export const panelSearch = (
  windowType: WindowType,
  panelType: PanelType,
  searchQuery?: {
    search: string;
    caseSensitive?: boolean;
    regexp?: boolean;
    replace?: string;
    action?:
      | "search"
      | "find_next"
      | "find_previous"
      | "replace"
      | "replace_all";
  }
): PanelSearchAction => {
  return {
    type: PANEL_SEARCH,
    payload: { windowType, panelType, searchQuery },
  };
};

export const PANEL_SET_PANE_SIZE = "PANEL_SET_PANE_SIZE";
export interface PanelSetPaneSizeAction {
  type: typeof PANEL_SET_PANE_SIZE;
  payload: {
    paneSize: number | string;
  };
}
export const panelSetPaneSize = (
  paneSize: number | string
): PanelSetPaneSizeAction => {
  return {
    type: PANEL_SET_PANE_SIZE,
    payload: { paneSize },
  };
};

export const PANEL_SET_SCROLL_PARENT = "PANEL_SET_SCROLL_PARENT";
export interface PanelSetScrollParentAction {
  type: typeof PANEL_SET_SCROLL_PARENT;
  payload: {
    scrollParent: HTMLElement;
  };
}
export const panelSetScrollParent = (
  scrollParent: HTMLElement
): PanelSetScrollParentAction => {
  return {
    type: PANEL_SET_SCROLL_PARENT,
    payload: { scrollParent },
  };
};

export const PANEL_SET_SCROLL_POSITION = "PANEL_SET_SCROLL_POSITION";
export interface PanelSetScrollPositionAction {
  type: typeof PANEL_SET_SCROLL_POSITION;
  payload: {
    windowType: WindowType;
    panelType: PanelType;
    scrollId: string;
    scrollPosition: { x?: number; y?: number };
  };
}
export const panelSetScrollPosition = (
  windowType: WindowType,
  panelType: PanelType,
  scrollId: string,
  scrollPosition: { x?: number; y?: number }
): PanelSetScrollPositionAction => {
  return {
    type: PANEL_SET_SCROLL_POSITION,
    payload: { windowType, panelType, scrollId, scrollPosition },
  };
};

export const PANEL_INSPECT = "PANEL_INSPECT";
export interface PanelInspectAction {
  type: typeof PANEL_INSPECT;
  payload: {
    windowType: WindowType;
    panelType: PanelType;
    targetId: string;
    propertyPaths?: string[];
  };
}
export const panelInspect = (
  windowType: WindowType,
  panelType: PanelType,
  targetId: string,
  propertyPaths?: string[]
): PanelInspectAction => {
  return {
    type: PANEL_INSPECT,
    payload: { windowType, panelType, targetId, propertyPaths },
  };
};

export const PANEL_SET_ERRORS = "PANEL_SET_ERRORS";
export interface PanelSetErrorsAction {
  type: typeof PANEL_SET_ERRORS;
  payload: {
    windowType: WindowType;
    panelType: PanelType;
    errors: { [propertyPath: string]: string };
  };
}
export const panelSetErrors = (
  windowType: WindowType,
  panelType: PanelType,
  errors: { [propertyPath: string]: string }
): PanelSetErrorsAction => {
  return {
    type: PANEL_SET_ERRORS,
    payload: { windowType, panelType, errors },
  };
};

export const PANEL_SUBMIT = "PANEL_SUBMIT";
export interface PanelSubmitAction {
  type: typeof PANEL_SUBMIT;
  payload: {
    windowType: WindowType;
    panelType: PanelType;
    submitting: boolean;
  };
}
export const panelSubmit = (
  windowType: WindowType,
  panelType: PanelType,
  submitting: boolean
): PanelSubmitAction => {
  return {
    type: PANEL_SUBMIT,
    payload: { windowType, panelType, submitting },
  };
};

export type PanelAction =
  | PanelOpenAction
  | PanelChangeInteractionAction
  | PanelToggleInteractionAction
  | PanelMultiInteractionAction
  | PanelToggleAllInteractionAction
  | PanelAddInteractionAction
  | PanelRemoveInteractionAction
  | PanelSetInteractionAction
  | PanelSetScriptingAction
  | PanelSetCursorAction
  | PanelSetScrollTopLineAction
  | PanelSetParentContainerArrangementAction
  | PanelChangeItemSectionAction
  | PanelSetLastAddedTypeIdAction
  | PanelSearchAction
  | PanelSetPaneSizeAction
  | PanelSetScrollParentAction
  | PanelSetScrollPositionAction
  | PanelInspectAction
  | PanelSetErrorsAction
  | PanelSubmitAction
  | PanelSaveEditorStateAction
  | PanelChangeEditorStateAction;
