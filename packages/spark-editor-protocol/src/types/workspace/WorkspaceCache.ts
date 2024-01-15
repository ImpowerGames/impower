import type { Range } from "vscode-languageserver-protocol";

export type PanelType =
  | "main"
  | "scripts"
  | "files"
  | "specs"
  | "game"
  | "project";

export type PaneType = "logic" | "assets" | "share";

export type PreviewMode = "page" | "game" | "screenplay" | "file";

export type SyncState =
  | "cached"
  | "unsynced"
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

export type ProjectMetadataField =
  | "name"
  | "textRevisionId"
  | "textSynced"
  | "zipRevisionId"
  | "zipSynced";

export interface GameState {
  loading?: boolean;
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
  mode: PreviewMode;
  modes: {
    page: {};
    game: GameState;
    screenplay: ScreenplayState;
    file: {};
  };
}
export interface EditorState {
  open?: boolean;
  filename?: string;
  visibleRange?: Range;
  selectedRange?: Range;
  breakpoints?: number[];
}

export interface PanelState {
  scrollIndex?: number;
  activeEditor?: EditorState;
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

export interface ProjectFile {
  name: string;
  content: string;
  modifiedTime: string;
}

export interface User {
  displayName?: string;
  emailAddress?: string;
  kind?: string;
  me?: boolean;
  permissionId?: string;
  photoLink?: string;
}

export interface Revision {
  id?: string;
  keepForever?: boolean;
  kind?: string;
  lastModifyingUser?: User;
  md5Checksum?: string;
  mimeType?: string;
  modifiedTime?: string;
  originalFilename?: string;
  size?: string;
}

export interface ProjectState {
  id?: string;
  name?: string;
  editingName?: boolean;
  pickingResource?: boolean;
  syncState?: SyncState;
  textPulledAt?: string;
  zipPulledAt?: string;
  revisions?: Revision[];
  breakpoints?: Record<string, number[]>;
}

export interface WorkspaceCache extends PanesState<PaneType> {
  project: ProjectState;
  preview: PreviewState;
}
