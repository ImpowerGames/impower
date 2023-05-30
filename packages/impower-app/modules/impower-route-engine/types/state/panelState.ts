import { SetupSectionType } from "../../../../../spark-engine";
import {
    SearchLineQuery,
    SearchTextQuery,
    SerializableEditorSelection,
    SerializableEditorState,
} from "../../../impower-script-editor";
import { WindowType } from "./windowState";

export type PanelType = "setup" | "assets" | "logic" | "detail" | "test";

export type PanelInteractionType = "Selected" | "Expanded";

export interface PanelCursorState {
  anchor: number;
  head: number;
  fromLine: number;
  toLine: number;
}

export type SnippetCategoryType =
  | "screenplay"
  | "flow"
  | "struct"
  | "entity"
  | "data";

export interface PanelState {
  paneSize: number | string;
  panels: {
    [containerType in WindowType]: {
      openPanel: PanelType;
      section?: SetupSectionType;
      scripting?: boolean;
      cursor?: PanelCursorState;
      toolbar?: "snippet";
      snippetPreview?: string;
      searchTextQuery?: SearchTextQuery;
      searchLineQuery?: SearchLineQuery;
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
