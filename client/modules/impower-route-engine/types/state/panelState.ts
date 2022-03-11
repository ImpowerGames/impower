import { SetupSectionType } from "../../../impower-game/data";
import {
  SearchAction,
  SerializableEditorSelection,
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

export type SnippetCategoryType = "screenplay" | "world" | "flow" | "data";

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
      editorChange?: {
        category?: string;
        action?: string;
        focus?: boolean;
        selection?: SerializableEditorSelection;
      };
      editorCategory?: string;
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
