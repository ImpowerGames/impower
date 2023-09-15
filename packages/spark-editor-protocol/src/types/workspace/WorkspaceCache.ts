import type { Range } from "vscode-languageserver-protocol";

export type PanelType =
  | "details"
  | "share"
  | "assets"
  | "music"
  | "main"
  | "sounds"
  | "widgets"
  | "views"
  | "sprites"
  | "maps"
  | "scripts";

export type PaneType = "setup" | "audio" | "displays" | "graphics" | "logic";

export type SyncState =
  | "cached"
  | "unsaved"
  | "synced"
  | "offline"
  | "loading"
  | "importing"
  | "exporting"
  | "syncing"
  | "load_error"
  | "import_error"
  | "export_error"
  | "sync_error"
  | "sync_conflict";

export interface GameState {
  running?: boolean;
  paused?: boolean;
  debugging?: boolean;
  compiling?: boolean;
}

export interface ScreenplayState {
  visibleRange?: Range;
}

export interface PreviewState {
  revealed?: boolean;
  mode: "page" | "game" | "screenplay" | "file";
  modes: {
    page: {};
    game: GameState;
    screenplay: ScreenplayState;
    file: {};
  };
}

export interface PanelState {
  scrollIndex?: number;
  activeEditor?: {
    open?: boolean;
    filename?: string;
    visibleRange?: Range;
    selectedRange?: Range;
  };
}

export interface PaneState<T extends string = string> {
  view?: string;
  panel: T;
  panels: Partial<Record<T, PanelState>>;
}

export interface PanesState<T extends string = string> {
  pane: T;
  panes: Record<T, PaneState<PanelType>>;
}

export interface ProjectMetadata {
  headRevisionId?: string;
  modifiedTime?: string;
  synced?: boolean;
}

export interface ProjectFile {
  name: string;
  content: string;
  modifiedTime: string;
}

export interface ProjectState {
  id?: string;
  name?: string;
  canModifyRemote?: boolean;
  editingName?: boolean;
  syncState?: SyncState;
  pulledAt?: string;
  conflict?: {
    remote?: ProjectFile;
    local?: ProjectFile;
  };
}

export interface WorkspaceCache extends PanesState<PaneType> {
  project: ProjectState;
  preview: PreviewState;
}
