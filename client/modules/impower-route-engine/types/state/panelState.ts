import {
  ItemSectionType,
  ItemType,
  Reference,
  SetupSectionType,
} from "../../../impower-game/data";
import { SerializableEditorState } from "../../../impower-script-editor";
import { WindowType } from "./windowState";

export type PanelType =
  | "Setup"
  | "Assets"
  | "Container"
  | "Item"
  | "Detail"
  | "Test";

export type ContainerArrangement = "List" | "Chart";

export type PanelInteractionType = "Selected" | "Expanded" | "Dragging";

export interface PanelCursorState {
  anchor: number;
  head: number;
  fromLine: number;
  toLine: number;
}

export interface PanelInteractionState {
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
  inspectedTargetId?: string;
  inspectedProperties?: string[];
  submitting?: boolean;
  errors?: { [propertyPath: string]: string };
  scrollPositions?: {
    [id: string]: {
      x?: number;
      y?: number;
    };
  };
  interactions?: {
    [interactionType in PanelInteractionType]: (Reference | string)[];
  };
}

export interface ContainerPanelState extends PanelInteractionState {
  scripting: boolean;
  cursor?: PanelCursorState;
  editorState?: SerializableEditorState;
  editorAction?: {
    action?: "undo" | "redo";
  };
  scrollTopLine?: number;
  foldedLines?: number[];
  arrangement: ContainerArrangement;
}

export interface ItemPanelState extends PanelInteractionState {
  section: ItemType | ItemSectionType | SetupSectionType;
  lastAddedTypeIds?: {
    [state in ItemType]: string;
  };
}

export interface PanelState {
  paneSize: number | string;
  scrollParent?: HTMLElement;
  panels: {
    [containerType in WindowType]: {
      openPanel: PanelType;
      Container?: ContainerPanelState;
      Item?: ItemPanelState;
      Detail?: PanelInteractionState;
    };
  };
}
