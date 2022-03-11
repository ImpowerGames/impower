import { SetupSectionType } from "../../../impower-game/data";
import {
  changeSelection,
  multiSelection,
  toggleSelection,
} from "../../../impower-route";
import {
  SearchAction,
  SerializableEditorSelection,
  SerializableEditorState,
} from "../../../impower-script-editor";
import { createPanelState } from "../../utils/createPanelState";
import {
  PanelAction,
  PANEL_ADD_INTERACTION,
  PANEL_CHANGE_DETAIL_SECTION,
  PANEL_CHANGE_EDITOR_STATE,
  PANEL_CHANGE_INTERACTION,
  PANEL_INSPECT,
  PANEL_MULTI_INTERACTION,
  PANEL_OPEN,
  PANEL_REMOVE_INTERACTION,
  PANEL_SAVE_EDITOR_STATE,
  PANEL_SEARCH,
  PANEL_SET_CURSOR,
  PANEL_SET_ERRORS,
  PANEL_SET_INTERACTION,
  PANEL_SET_PANE_SIZE,
  PANEL_SET_SCRIPTING,
  PANEL_SET_SCROLL_TOP_LINE,
  PANEL_SUBMIT,
  PANEL_TOGGLE_ALL_INTERACTION,
  PANEL_TOGGLE_INTERACTION,
} from "../actions/panelActions";
import {
  PanelInteractionType,
  PanelState,
  PanelType,
} from "../state/panelState";
import { WindowType } from "../state/windowState";

const doOpen = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    panelType: PanelType;
  }
): PanelState => {
  const { windowType, panelType } = payload;
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...state.panels[windowType],
        openPanel: panelType,
      },
    },
  };
};

const doSetInteraction = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    references: string[];
  }
): PanelState => {
  const { windowType, interactionType, references } = payload;
  return {
    ...state,
    panels: {
      ...state?.panels,
      [windowType]: {
        ...(state?.panels?.[windowType] || {}),
        interactions: {
          ...(state?.panels?.[windowType]?.interactions || {}),
          [interactionType]: [...references],
        },
      },
    },
  };
};

const doChangeInteraction = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    reference: string;
  }
): PanelState => {
  const { windowType, interactionType, reference } = payload;
  const interactedReferences =
    state?.panels?.[windowType]?.interactions?.[interactionType] || [];

  const allReferences = [...interactedReferences];
  if (
    !allReferences.find((r) => JSON.stringify(r) === JSON.stringify(reference))
  ) {
    allReferences.push(reference);
  }

  const newSelection = changeSelection(
    JSON.stringify(reference),
    interactedReferences.map((r) => JSON.stringify(r))
  );
  const newReferences = allReferences.filter((r) =>
    newSelection.includes(JSON.stringify(r))
  );

  return doSetInteraction(state, {
    windowType,
    interactionType,
    references: newReferences,
  });
};

const doAddInteraction = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    references: string[];
  }
): PanelState => {
  const { windowType, interactionType, references } = payload;
  const interactedReferences =
    state?.panels?.[windowType]?.interactions?.[interactionType] || [];

  const newReferences = Array.from(
    new Set([...interactedReferences, ...references])
  );

  return doSetInteraction(state, {
    windowType,
    interactionType,
    references: newReferences,
  });
};

const doRemoveInteraction = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    references: string[];
  }
): PanelState => {
  const { windowType, interactionType, references } = payload;
  const interactedReferences =
    state?.panels?.[windowType]?.interactions?.[interactionType] || [];

  const ids = references.map((r) => JSON.stringify(r));
  const newReferences = interactedReferences.filter(
    (r) => !ids.includes(JSON.stringify(r))
  );

  return doSetInteraction(state, {
    windowType,
    interactionType,
    references: newReferences,
  });
};

const doToggleInteraction = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    reference: string;
  }
): PanelState => {
  const { windowType, interactionType, reference } = payload;
  const interactedReferences =
    state?.panels?.[windowType]?.interactions?.[interactionType] || [];

  const allReferences = [...interactedReferences];
  if (
    !allReferences.find((r) => JSON.stringify(r) === JSON.stringify(reference))
  ) {
    allReferences.push(reference);
  }

  const newSelection = toggleSelection(
    JSON.stringify(reference),
    interactedReferences.map((r) => JSON.stringify(r))
  );
  const newReferences = allReferences.filter((r) =>
    newSelection.includes(JSON.stringify(r))
  );

  return doSetInteraction(state, {
    windowType,
    interactionType,
    references: newReferences,
  });
};

const doToggleAllInteraction = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    references: string[];
  }
): PanelState => {
  const { windowType, interactionType, references } = payload;
  const interactedReferences =
    state?.panels?.[windowType]?.interactions?.[interactionType] || [];

  const interactedIds = interactedReferences.map((r) => JSON.stringify(r));
  const notInteractedReferences = references.filter(
    (r) => !interactedIds.includes(JSON.stringify(r))
  );
  const newSelectedReferences =
    notInteractedReferences.length > 0 ? references : [];

  return doSetInteraction(state, {
    windowType,
    interactionType,
    references: newSelectedReferences,
  });
};

export const doMultiInteraction = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    allReferences: string[];
    newReference: string;
  }
): PanelState => {
  const { windowType, interactionType, allReferences, newReference } = payload;
  const interactedReferences =
    state?.panels?.[windowType]?.interactions?.[interactionType] || [];

  if (interactedReferences.length === 0) {
    // If nothing is interacted, make it the only interacted item
    return doSetInteraction(state, {
      windowType,
      interactionType,
      references: [newReference],
    });
  }
  const newId = JSON.stringify(newReference);
  const interactedIds = interactedReferences.map((r) => JSON.stringify(r));
  const allIds = allReferences.map((r) => JSON.stringify(r));

  const combinedIds: string[] = multiSelection(newId, interactedIds, allIds);

  const combinedReferences = allReferences.filter((r) =>
    combinedIds.includes(JSON.stringify(r))
  );

  return doSetInteraction(state, {
    windowType,
    interactionType,
    references: combinedReferences,
  });
};

const doSetScripting = (
  state: PanelState,
  payload: { windowType: WindowType; scripting: boolean }
): PanelState => {
  const { windowType, scripting } = payload;
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...state.panels[windowType],
        scripting,
      },
    },
  };
};

const doSetCursor = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    cursor: {
      anchor: number;
      head: number;
      fromLine: number;
      toLine: number;
    };
  }
): PanelState => {
  const { windowType, cursor } = payload;
  return {
    ...state,
    panels: {
      ...state?.panels,
      [windowType]: {
        ...(state?.panels?.[windowType] || {}),
        cursor,
      },
    },
  };
};

const doSetScrollTopLine = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    scrollTopLine: number;
  }
): PanelState => {
  const { windowType, scrollTopLine } = payload;
  return {
    ...state,
    panels: {
      ...state?.panels,
      [windowType]: {
        ...(state?.panels?.[windowType] || {}),
        scrollTopLine,
      },
    },
  };
};

const doSaveEditorState = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    editorState: SerializableEditorState;
  }
): PanelState => {
  const { windowType, editorState } = payload;
  return {
    ...state,
    panels: {
      ...state?.panels,
      [windowType]: {
        ...(state?.panels?.[windowType] || {}),
        editorState,
      },
    },
  };
};

const doChangeEditorState = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    editorChange: {
      category?: string;
      action?: string;
      focus?: boolean;
      selection?: SerializableEditorSelection;
    };
  }
): PanelState => {
  const { windowType, editorChange } = payload;
  let editorCategory = state?.panels?.[windowType]?.editorCategory;
  const category = editorChange?.category;
  if (category) {
    editorCategory = category;
  }
  return {
    ...state,
    panels: {
      ...state?.panels,
      [windowType]: {
        ...(state?.panels?.[windowType] || {}),
        editorChange,
        editorCategory,
      },
    },
  };
};

const doChangeSection = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    section: SetupSectionType;
  }
): PanelState => {
  const { windowType, section } = payload;
  if (!windowType) {
    return state;
  }
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...state.panels[windowType],
        section,
      },
    },
  };
};

const doSearch = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    searchQuery?: SearchAction;
  }
): PanelState => {
  const { windowType, searchQuery } = payload;
  if (!windowType) {
    return state;
  }
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...state.panels[windowType],
        searchQuery: searchQuery
          ? {
              ...(state.panels[windowType]?.searchQuery || {}),
              ...searchQuery,
            }
          : searchQuery,
      },
    },
  };
};

const doSetPaneSize = (
  state: PanelState,
  payload: {
    paneSize: number | string;
  }
): PanelState => {
  const { paneSize } = payload;
  return {
    ...state,
    paneSize,
  };
};

const doInspect = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    targetId: string;
    propertyPaths?: string[];
  }
): PanelState => {
  const { windowType, targetId, propertyPaths } = payload;
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...state.panels[windowType],
        inspectedTargetId: targetId,
        inspectedProperties: propertyPaths,
      },
    },
  };
};

const doSetErrors = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    errors: { [propertyPath: string]: string };
  }
): PanelState => {
  const { windowType, errors } = payload;
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...state.panels[windowType],
        errors,
      },
    },
  };
};

const doSubmit = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    submitting: boolean;
  }
): PanelState => {
  const { windowType, submitting } = payload;
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...state.panels[windowType],
        submitting,
      },
    },
  };
};

export const panelReducer = (
  state = createPanelState(),
  action: PanelAction
): PanelState => {
  switch (action.type) {
    case PANEL_OPEN:
      return doOpen(state, action.payload);
    case PANEL_SET_INTERACTION:
      return doSetInteraction(state, action.payload);
    case PANEL_CHANGE_INTERACTION:
      return doChangeInteraction(state, action.payload);
    case PANEL_ADD_INTERACTION:
      return doAddInteraction(state, action.payload);
    case PANEL_REMOVE_INTERACTION:
      return doRemoveInteraction(state, action.payload);
    case PANEL_TOGGLE_INTERACTION:
      return doToggleInteraction(state, action.payload);
    case PANEL_TOGGLE_ALL_INTERACTION:
      return doToggleAllInteraction(state, action.payload);
    case PANEL_MULTI_INTERACTION:
      return doMultiInteraction(state, action.payload);
    case PANEL_SET_SCRIPTING:
      return doSetScripting(state, action.payload);
    case PANEL_SET_CURSOR:
      return doSetCursor(state, action.payload);
    case PANEL_SET_SCROLL_TOP_LINE:
      return doSetScrollTopLine(state, action.payload);
    case PANEL_SAVE_EDITOR_STATE:
      return doSaveEditorState(state, action.payload);
    case PANEL_CHANGE_EDITOR_STATE:
      return doChangeEditorState(state, action.payload);
    case PANEL_CHANGE_DETAIL_SECTION:
      return doChangeSection(state, action.payload);
    case PANEL_SEARCH:
      return doSearch(state, action.payload);
    case PANEL_SET_PANE_SIZE:
      return doSetPaneSize(state, action.payload);
    case PANEL_INSPECT:
      return doInspect(state, action.payload);
    case PANEL_SET_ERRORS:
      return doSetErrors(state, action.payload);
    case PANEL_SUBMIT:
      return doSubmit(state, action.payload);
    default:
      return state;
  }
};
