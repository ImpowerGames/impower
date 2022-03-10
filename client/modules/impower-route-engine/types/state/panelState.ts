import { SetupSectionType } from "../../../impower-game/data";
import {
  SearchAction,
  SerializableEditorState,
} from "../../../impower-script-editor";
import { WindowType } from "./windowState";

export type PanelType =
  | "Setup"
  | "Assets"
  | "Entities"
  | "Logic"
  | "Detail"
  | "Test";

export type PanelInteractionType = "Selected" | "Expanded";

export interface PanelCursorState {
  anchor: number;
  head: number;
  fromLine: number;
  toLine: number;
}

export interface PanelState {
  paneSize: number | string;
  panels: {
    [containerType in WindowType]: {
      openPanel: PanelType;
      section?: SetupSectionType;
      scripting?: boolean;
      cursor?: PanelCursorState;
      searchQuery?: SearchAction;
      editorState?: SerializableEditorState;
      editorAction: { action?: string; focus?: boolean };
      scrollTopLine?: number;
      inspectedTargetId?: string;
      inspectedProperties?: string[];
      submitting?: boolean;
      errors?: { [propertyPath: string]: string };
      interactions?: {
        [interactionType in PanelInteractionType]: string[];
      };
    };
  };
}
