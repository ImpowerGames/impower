import {
  ItemSectionType,
  ItemType,
  Reference,
  SetupSectionType,
} from "../../../impower-game/data";
import {
  changeSelection,
  multiSelection,
  toggleSelection,
} from "../../../impower-route";
import { SerializableEditorState } from "../../../impower-script-editor";
import {
  PanelAction,
  PANEL_ADD_INTERACTION,
  PANEL_CHANGE_EDITOR_STATE,
  PANEL_CHANGE_INTERACTION,
  PANEL_CHANGE_ITEM_SECTION,
  PANEL_INSPECT,
  PANEL_MULTI_INTERACTION,
  PANEL_OPEN,
  PANEL_REMOVE_INTERACTION,
  PANEL_SAVE_EDITOR_STATE,
  PANEL_SEARCH,
  PANEL_SET_CURSOR,
  PANEL_SET_ERRORS,
  PANEL_SET_INTERACTION,
  PANEL_SET_LAST_ADDED_TYPE_ID,
  PANEL_SET_PANE_SIZE,
  PANEL_SET_PARENT_CONTAINER_ARRANGEMENT,
  PANEL_SET_SCRIPTING,
  PANEL_SET_SCROLL_PARENT,
  PANEL_SET_SCROLL_POSITION,
  PANEL_SET_SCROLL_TOP_LINE,
  PANEL_SUBMIT,
  PANEL_TOGGLE_ALL_INTERACTION,
  PANEL_TOGGLE_INTERACTION,
} from "../actions/panelActions";
import { getInteractionsSelector } from "../selectors/panelSelectors";
import {
  ContainerArrangement,
  PanelInteractionType,
  PanelState,
  PanelType,
} from "../state/panelState";
import { WindowType } from "../state/windowState";
import { createPanelState } from "../utils/createPanelState";

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
    panelType: PanelType;
    references: (Reference | string)[];
  }
): PanelState => {
  const { windowType, interactionType, panelType, references } = payload;
  return {
    ...state,
    panels: {
      ...state?.panels,
      [windowType]: {
        ...(state?.panels?.[windowType] || {}),
        [panelType]: {
          ...(state?.panels?.[windowType]?.[panelType] || {}),
          interactions: {
            ...(state?.panels?.[windowType]?.[panelType]?.interactions || {}),
            [interactionType]: [...references],
          },
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
    panelType: PanelType;
    reference: Reference | string;
  }
): PanelState => {
  const { windowType, interactionType, panelType, reference } = payload;
  const interactedReferences = getInteractionsSelector(
    state,
    windowType,
    interactionType,
    panelType
  );

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
    panelType,
    references: newReferences,
  });
};

const doAddInteraction = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    panelType: PanelType;
    references: (Reference | string)[];
  }
): PanelState => {
  const { windowType, interactionType, panelType, references } = payload;
  const interactedReferences = getInteractionsSelector(
    state,
    windowType,
    interactionType,
    panelType
  );

  const newReferences = Array.from(
    new Set([...interactedReferences, ...references])
  );

  return doSetInteraction(state, {
    windowType,
    interactionType,
    panelType,
    references: newReferences,
  });
};

const doRemoveInteraction = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    panelType: PanelType;
    references: (Reference | string)[];
  }
): PanelState => {
  const { windowType, interactionType, panelType, references } = payload;
  const interactedReferences = getInteractionsSelector(
    state,
    windowType,
    interactionType,
    panelType
  );

  const ids = references.map((r) => JSON.stringify(r));
  const newReferences = interactedReferences.filter(
    (r) => !ids.includes(JSON.stringify(r))
  );

  return doSetInteraction(state, {
    windowType,
    interactionType,
    panelType,
    references: newReferences,
  });
};

const doToggleInteraction = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    panelType: PanelType;
    reference: Reference | string;
  }
): PanelState => {
  const { windowType, interactionType, panelType, reference } = payload;
  const interactedReferences = getInteractionsSelector(
    state,
    windowType,
    interactionType,
    panelType
  );

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
    panelType,
    references: newReferences,
  });
};

const doToggleAllInteraction = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    panelType: PanelType;
    references: (Reference | string)[];
  }
): PanelState => {
  const { windowType, interactionType, panelType, references } = payload;
  const interactedReferences = getInteractionsSelector(
    state,
    windowType,
    interactionType,
    panelType
  );

  const interactedIds = interactedReferences.map((r) => JSON.stringify(r));
  const notInteractedReferences = references.filter(
    (r) => !interactedIds.includes(JSON.stringify(r))
  );
  const newSelectedReferences =
    notInteractedReferences.length > 0 ? references : [];

  return doSetInteraction(state, {
    windowType,
    interactionType,
    panelType,
    references: newSelectedReferences,
  });
};

export const doMultiInteraction = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    interactionType: PanelInteractionType;
    panelType: PanelType;
    allReferences: (Reference | string)[];
    newReference: Reference | string;
  }
): PanelState => {
  const {
    windowType,
    interactionType,
    panelType,
    allReferences,
    newReference,
  } = payload;
  const interactedReferences = getInteractionsSelector(
    state,
    windowType,
    interactionType,
    panelType
  );

  if (interactedReferences.length === 0) {
    // If nothing is interacted, make it the only interacted item
    return doSetInteraction(state, {
      windowType,
      interactionType,
      panelType,
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
    panelType,
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
        Container: {
          ...state.panels[windowType].Container,
          scripting,
        },
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
        Container: {
          ...(state?.panels?.[windowType]?.Container || {}),
          cursor,
        },
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
        Container: {
          ...(state?.panels?.[windowType]?.Container || {}),
          scrollTopLine,
        },
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
        Container: {
          ...(state?.panels?.[windowType]?.Container || {}),
          editorState,
        },
      },
    },
  };
};

const doChangeEditorState = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    editorAction: { action: "undo" | "redo" };
  }
): PanelState => {
  const { windowType, editorAction } = payload;
  return {
    ...state,
    panels: {
      ...state?.panels,
      [windowType]: {
        ...(state?.panels?.[windowType] || {}),
        Container: {
          ...(state?.panels?.[windowType]?.Container || {}),
          editorAction,
        },
      },
    },
  };
};

const doSetParentContainerArrangement = (
  state: PanelState,
  payload: { windowType: WindowType; arrangement: ContainerArrangement }
): PanelState => {
  const { windowType, arrangement } = payload;
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...state.panels[windowType],
        Container: {
          ...state.panels[windowType].Container,
          arrangement,
        },
      },
    },
  };
};

const doChangeItemSection = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    section: ItemType | ItemSectionType | SetupSectionType;
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
        Item: {
          ...state.panels[windowType].Item,
          section,
        },
      },
    },
  };
};

const doSetLastAddedTypeId = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    refType: ItemType;
    refTypeId: string;
  }
): PanelState => {
  const { windowType, refType, refTypeId } = payload;
  if (!windowType) {
    return state;
  }
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...(state?.panels?.[windowType] || {}),
        Item: {
          ...(state?.panels?.[windowType]?.Item || {}),
          lastAddedTypeIds: {
            ...(state?.panels?.[windowType]?.Item?.lastAddedTypeIds || {}),
            [refType]: refTypeId,
          },
        },
      },
    },
  };
};

const doSearch = (
  state: PanelState,
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
  }
): PanelState => {
  const { windowType, panelType, searchQuery } = payload;
  if (!windowType) {
    return state;
  }
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...state.panels[windowType],
        [panelType]: {
          ...state.panels[windowType][panelType],
          searchQuery: searchQuery
            ? {
                ...(state.panels[windowType][panelType]?.searchQuery || {}),
                ...searchQuery,
              }
            : searchQuery,
        },
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

const doSetScrollParent = (
  state: PanelState,
  payload: {
    scrollParent: HTMLElement;
  }
): PanelState => {
  const { scrollParent } = payload;
  return {
    ...state,
    scrollParent,
  };
};

const doSetScrollPosition = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    panelType: PanelType;
    scrollId: string;
    scrollPosition: { x?: number; y?: number };
  }
): PanelState => {
  const { windowType, panelType, scrollId, scrollPosition } = payload;
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...state.panels[windowType],
        [panelType]: {
          ...(state?.panels?.[windowType]?.[panelType] || {}),
          scrollPositions: {
            ...(state?.panels?.[windowType]?.[panelType]?.scrollPositions ||
              {}),
            [scrollId]: {
              ...(state?.panels?.[windowType]?.[panelType]?.scrollPositions?.[
                scrollId
              ] || {}),
              ...scrollPosition,
            },
          },
        },
      },
    },
  };
};

const doInspect = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    panelType: PanelType;
    targetId: string;
    propertyPaths?: string[];
  }
): PanelState => {
  const { windowType, panelType, targetId, propertyPaths } = payload;
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...state.panels[windowType],
        [panelType]: {
          ...state.panels[windowType][panelType],
          inspectedTargetId: targetId,
          inspectedProperties: propertyPaths,
        },
      },
    },
  };
};

const doSetErrors = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    panelType: PanelType;
    errors: { [propertyPath: string]: string };
  }
): PanelState => {
  const { windowType, panelType, errors } = payload;
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...state.panels[windowType],
        [panelType]: {
          ...state.panels[windowType][panelType],
          errors,
        },
      },
    },
  };
};

const doSubmit = (
  state: PanelState,
  payload: {
    windowType: WindowType;
    panelType: PanelType;
    submitting: boolean;
  }
): PanelState => {
  const { windowType, panelType, submitting } = payload;
  return {
    ...state,
    panels: {
      ...state.panels,
      [windowType]: {
        ...state.panels[windowType],
        [panelType]: {
          ...state.panels[windowType][panelType],
          submitting,
        },
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
    case PANEL_SET_PARENT_CONTAINER_ARRANGEMENT:
      return doSetParentContainerArrangement(state, action.payload);
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
    case PANEL_CHANGE_ITEM_SECTION:
      return doChangeItemSection(state, action.payload);
    case PANEL_SET_LAST_ADDED_TYPE_ID:
      return doSetLastAddedTypeId(state, action.payload);
    case PANEL_SEARCH:
      return doSearch(state, action.payload);
    case PANEL_SET_PANE_SIZE:
      return doSetPaneSize(state, action.payload);
    case PANEL_SET_SCROLL_PARENT:
      return doSetScrollParent(state, action.payload);
    case PANEL_SET_SCROLL_POSITION:
      return doSetScrollPosition(state, action.payload);
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
