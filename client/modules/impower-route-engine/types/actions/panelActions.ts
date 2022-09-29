import { SetupSectionType } from "../../../../../spark-engine";
import {
  SearchLineQuery,
  SearchTextQuery,
  SerializableEditorSelection,
  SerializableEditorState,
} from "../../../impower-script-editor";
import { PanelInteractionType, PanelType } from "../state/panelState";
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
    reference: string;
  };
}
export const panelChangeInteraction = (
  windowType: WindowType,
  interactionType: PanelInteractionType,
  reference: string
): PanelChangeInteractionAction => {
  return {
    type: PANEL_CHANGE_INTERACTION,
    payload: { windowType, interactionType, reference },
  };
};

export const PANEL_TOGGLE_INTERACTION = "PANEL_TOGGLE_INTERACTION";
export interface PanelToggleInteractionAction {
  type: typeof PANEL_TOGGLE_INTERACTION;
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    reference: string;
  };
}
export const panelToggleInteraction = (
  windowType: WindowType,
  interactionType: PanelInteractionType,
  reference: string
): PanelToggleInteractionAction => {
  return {
    type: PANEL_TOGGLE_INTERACTION,
    payload: { windowType, interactionType, reference },
  };
};

export const PANEL_MULTI_INTERACTION = "PANEL_MULTI_INTERACTION";
export interface PanelMultiInteractionAction {
  type: typeof PANEL_MULTI_INTERACTION;
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    allReferences: string[];
    newReference: string;
  };
}
export const panelMultiInteraction = (
  windowType: WindowType,
  interactionType: PanelInteractionType,
  allReferences: string[],
  newReference: string
): PanelMultiInteractionAction => {
  return {
    type: PANEL_MULTI_INTERACTION,
    payload: {
      windowType,
      interactionType,
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
    references: string[];
  };
}
export function panelToggleAllInteraction(
  windowType: WindowType,
  interactionType: PanelInteractionType,
  references: string[]
): PanelToggleAllInteractionAction {
  return {
    type: PANEL_TOGGLE_ALL_INTERACTION,
    payload: { windowType, interactionType, references },
  };
}

export const PANEL_ADD_INTERACTION = "PANEL_ADD_INTERACTION";
export interface PanelAddInteractionAction {
  type: typeof PANEL_ADD_INTERACTION;
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    references: string[];
  };
}
export const panelAddInteraction = (
  windowType: WindowType,
  interactionType: PanelInteractionType,
  references: string[]
): PanelAddInteractionAction => {
  return {
    type: PANEL_ADD_INTERACTION,
    payload: { windowType, interactionType, references },
  };
};

export const PANEL_REMOVE_INTERACTION = "PANEL_REMOVE_INTERACTION";
export interface PanelRemoveInteractionAction {
  type: typeof PANEL_REMOVE_INTERACTION;
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    references: string[];
  };
}
export const panelRemoveInteraction = (
  windowType: WindowType,
  interactionType: PanelInteractionType,
  references: string[]
): PanelRemoveInteractionAction => {
  return {
    type: PANEL_REMOVE_INTERACTION,
    payload: { windowType, interactionType, references },
  };
};

export const PANEL_SET_INTERACTION = "PANEL_SET_INTERACTION";
export interface PanelSetInteractionAction {
  type: typeof PANEL_SET_INTERACTION;
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    references: string[];
  };
}
export const panelSetInteraction = (
  windowType: WindowType,
  interactionType: PanelInteractionType,
  references: string[]
): PanelSetInteractionAction => {
  return {
    type: PANEL_SET_INTERACTION,
    payload: { windowType, interactionType, references },
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
    editorChange: {
      category?: string;
      action?: string;
      focus?: boolean;
      selection?: SerializableEditorSelection;
    };
  };
}
export const panelChangeEditorState = (
  windowType: WindowType,
  editorChange: {
    category?: string;
    action?: string;
    focus?: boolean;
    selection?: SerializableEditorSelection;
  }
): PanelChangeEditorStateAction => {
  return {
    type: PANEL_CHANGE_EDITOR_STATE,
    payload: { windowType, editorChange },
  };
};

export const PANEL_SNIPPET_PREVIEW = "PANEL_SNIPPET_PREVIEW";
export interface PanelSnippetPreviewAction {
  type: typeof PANEL_SNIPPET_PREVIEW;
  payload: {
    windowType: WindowType;
    snippetPreview: string;
  };
}
export const panelSnippetPreview = (
  windowType: WindowType,
  snippetPreview: string
): PanelSnippetPreviewAction => {
  return {
    type: PANEL_SNIPPET_PREVIEW,
    payload: { windowType, snippetPreview },
  };
};

export const PANEL_CHANGE_DETAIL_SECTION = "PANEL_CHANGE_DETAIL_SECTION";
export interface PanelChangeDetailSectionAction {
  type: typeof PANEL_CHANGE_DETAIL_SECTION;
  payload: {
    windowType: WindowType;
    section: SetupSectionType;
  };
}
export const panelChangeItemSection = (
  windowType: WindowType,
  section: SetupSectionType
): PanelChangeDetailSectionAction => {
  return {
    type: PANEL_CHANGE_DETAIL_SECTION,
    payload: { windowType, section },
  };
};

export const PANEL_SEARCH_TEXT = "PANEL_SEARCH";
export interface PanelSearchTextAction {
  type: typeof PANEL_SEARCH_TEXT;
  payload: {
    windowType: WindowType;
    searchTextQuery?: SearchTextQuery;
  };
}
export const panelSearchText = (
  windowType: WindowType,
  searchTextQuery?: SearchTextQuery
): PanelSearchTextAction => {
  return {
    type: PANEL_SEARCH_TEXT,
    payload: { windowType, searchTextQuery },
  };
};

export const PANEL_SEARCH_LINE = "PANEL_SEARCH_LINE";
export interface PanelSearchLineAction {
  type: typeof PANEL_SEARCH_LINE;
  payload: {
    windowType: WindowType;
    searchLineQuery?: SearchLineQuery;
  };
}
export const panelSearchLine = (
  windowType: WindowType,
  searchLineQuery?: SearchLineQuery
): PanelSearchLineAction => {
  return {
    type: PANEL_SEARCH_LINE,
    payload: { windowType, searchLineQuery },
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

export const PANEL_INSPECT = "PANEL_INSPECT";
export interface PanelInspectAction {
  type: typeof PANEL_INSPECT;
  payload: {
    windowType: WindowType;
    targetId: string;
    propertyPaths?: string[];
  };
}
export const panelInspect = (
  windowType: WindowType,
  targetId: string,
  propertyPaths?: string[]
): PanelInspectAction => {
  return {
    type: PANEL_INSPECT,
    payload: { windowType, targetId, propertyPaths },
  };
};

export const PANEL_SET_ERRORS = "PANEL_SET_ERRORS";
export interface PanelSetErrorsAction {
  type: typeof PANEL_SET_ERRORS;
  payload: {
    windowType: WindowType;
    errors: { [propertyPath: string]: string };
  };
}
export const panelSetErrors = (
  windowType: WindowType,
  errors: { [propertyPath: string]: string }
): PanelSetErrorsAction => {
  return {
    type: PANEL_SET_ERRORS,
    payload: { windowType, errors },
  };
};

export const PANEL_SUBMIT = "PANEL_SUBMIT";
export interface PanelSubmitAction {
  type: typeof PANEL_SUBMIT;
  payload: {
    windowType: WindowType;
    submitting: boolean;
  };
}
export const panelSubmit = (
  windowType: WindowType,
  submitting: boolean
): PanelSubmitAction => {
  return {
    type: PANEL_SUBMIT,
    payload: { windowType, submitting },
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
  | PanelChangeDetailSectionAction
  | PanelSearchTextAction
  | PanelSearchLineAction
  | PanelSetPaneSizeAction
  | PanelInspectAction
  | PanelSetErrorsAction
  | PanelSubmitAction
  | PanelSaveEditorStateAction
  | PanelChangeEditorStateAction
  | PanelSnippetPreviewAction;
