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
import {
  DataPanelAction,
  DATA_PANEL_ADD_INTERACTION,
  DATA_PANEL_CHANGE_INTERACTION,
  DATA_PANEL_CHANGE_ITEM_SECTION,
  DATA_PANEL_INSPECT,
  DATA_PANEL_MULTI_INTERACTION,
  DATA_PANEL_OPEN,
  DATA_PANEL_REMOVE_INTERACTION,
  DATA_PANEL_SEARCH,
  DATA_PANEL_SET_CURSOR,
  DATA_PANEL_SET_ERRORS,
  DATA_PANEL_SET_INTERACTION,
  DATA_PANEL_SET_LAST_ADDED_TYPE_ID,
  DATA_PANEL_SET_PANE_SIZE,
  DATA_PANEL_SET_PARENT_CONTAINER_ARRANGEMENT,
  DATA_PANEL_SET_SCRIPTING,
  DATA_PANEL_SET_SCROLL_PARENT,
  DATA_PANEL_SET_SCROLL_POSITION,
  DATA_PANEL_SET_SCROLL_TOP_LINE,
  DATA_PANEL_SUBMIT,
  DATA_PANEL_TOGGLE_ALL_INTERACTION,
  DATA_PANEL_TOGGLE_INTERACTION,
} from "../actions/dataPanelActions";
import { getInteractionsSelector } from "../selectors/dataPanelSelectors";
import {
  ContainerArrangement,
  createDataPanelState,
  DataInteractionType,
  DataPanelState,
  DataPanelType,
  DataWindowType,
} from "../state/dataPanelState";

const doOpen = (
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    panelType: DataPanelType;
  }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    references: (Reference | string)[];
  }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    reference: Reference | string;
  }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    references: (Reference | string)[];
  }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    references: (Reference | string)[];
  }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    reference: Reference | string;
  }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    references: (Reference | string)[];
  }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    interactionType: DataInteractionType;
    panelType: DataPanelType;
    allReferences: (Reference | string)[];
    newReference: Reference | string;
  }
): DataPanelState => {
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
  state: DataPanelState,
  payload: { windowType: DataWindowType; scripting: boolean }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    cursor: {
      anchor: number;
      head: number;
      fromLine: number;
      toLine: number;
    };
  }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    scrollTopLine: number;
  }
): DataPanelState => {
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

const doSetParentContainerArrangement = (
  state: DataPanelState,
  payload: { windowType: DataWindowType; arrangement: ContainerArrangement }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    section: ItemType | ItemSectionType | SetupSectionType;
  }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    refType: ItemType;
    refTypeId: string;
  }
): DataPanelState => {
  const { windowType, refType, refTypeId } = payload;
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
          lastAddedTypeIds: {
            ...state.panels[windowType].Item.lastAddedTypeIds,
            [refType]: refTypeId,
          },
        },
      },
    },
  };
};

const doSearch = (
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    panelType: DataPanelType;
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
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    paneSize: number | string;
  }
): DataPanelState => {
  const { paneSize } = payload;
  return {
    ...state,
    paneSize,
  };
};

const doSetScrollParent = (
  state: DataPanelState,
  payload: {
    scrollParent: HTMLElement;
  }
): DataPanelState => {
  const { scrollParent } = payload;
  return {
    ...state,
    scrollParent,
  };
};

const doSetScrollPosition = (
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    panelType: DataPanelType;
    scrollId: string;
    scrollPosition: { x?: number; y?: number };
  }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    panelType: DataPanelType;
    targetId: string;
    propertyPaths?: string[];
  }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    panelType: DataPanelType;
    errors: { [propertyPath: string]: string };
  }
): DataPanelState => {
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
  state: DataPanelState,
  payload: {
    windowType: DataWindowType;
    panelType: DataPanelType;
    submitting: boolean;
  }
): DataPanelState => {
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

export const dataPanelReducer = (
  state = createDataPanelState(),
  action: DataPanelAction
): DataPanelState => {
  switch (action.type) {
    case DATA_PANEL_OPEN:
      return doOpen(state, action.payload);
    case DATA_PANEL_SET_INTERACTION:
      return doSetInteraction(state, action.payload);
    case DATA_PANEL_CHANGE_INTERACTION:
      return doChangeInteraction(state, action.payload);
    case DATA_PANEL_ADD_INTERACTION:
      return doAddInteraction(state, action.payload);
    case DATA_PANEL_REMOVE_INTERACTION:
      return doRemoveInteraction(state, action.payload);
    case DATA_PANEL_TOGGLE_INTERACTION:
      return doToggleInteraction(state, action.payload);
    case DATA_PANEL_TOGGLE_ALL_INTERACTION:
      return doToggleAllInteraction(state, action.payload);
    case DATA_PANEL_MULTI_INTERACTION:
      return doMultiInteraction(state, action.payload);
    case DATA_PANEL_SET_PARENT_CONTAINER_ARRANGEMENT:
      return doSetParentContainerArrangement(state, action.payload);
    case DATA_PANEL_SET_SCRIPTING:
      return doSetScripting(state, action.payload);
    case DATA_PANEL_SET_CURSOR:
      return doSetCursor(state, action.payload);
    case DATA_PANEL_SET_SCROLL_TOP_LINE:
      return doSetScrollTopLine(state, action.payload);
    case DATA_PANEL_CHANGE_ITEM_SECTION:
      return doChangeItemSection(state, action.payload);
    case DATA_PANEL_SET_LAST_ADDED_TYPE_ID:
      return doSetLastAddedTypeId(state, action.payload);
    case DATA_PANEL_SEARCH:
      return doSearch(state, action.payload);
    case DATA_PANEL_SET_PANE_SIZE:
      return doSetPaneSize(state, action.payload);
    case DATA_PANEL_SET_SCROLL_PARENT:
      return doSetScrollParent(state, action.payload);
    case DATA_PANEL_SET_SCROLL_POSITION:
      return doSetScrollPosition(state, action.payload);
    case DATA_PANEL_INSPECT:
      return doInspect(state, action.payload);
    case DATA_PANEL_SET_ERRORS:
      return doSetErrors(state, action.payload);
    case DATA_PANEL_SUBMIT:
      return doSubmit(state, action.payload);
    default:
      return state;
  }
};
