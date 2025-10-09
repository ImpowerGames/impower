import type { Diagnostic } from "../base/Diagnostic";
import type { Range } from "../base/Range";

export type PanelType =
  | "main"
  | "scripts"
  | "files"
  | "urls"
  | "game"
  | "screenplay"
  | "project";

export type PaneType = "logic" | "assets" | "share";

export type PreviewMode = "page" | "game" | "screenplay" | "file";

export type SyncStatus =
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
  filename?: string;
  open?: boolean;
  focused?: boolean;
  visibleRange?: Range;
  selectedRange?: Range;
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
  directory?: string;
}

export interface SyncState {
  status?: SyncStatus;
  textPulledAt?: string;
  zipPulledAt?: string;
  revisions?: Revision[];
}

export interface ScreenState {
  horizontalLayout?: boolean;
  editingName?: boolean;
  pickingResource?: boolean;
}

export interface DebugState {
  simulateChoices?: Record<string, (number | undefined)[]>;
  breakpoints?: Record<string, number[]>;
  pinpoints?: Record<string, number[]>;
  highlights?: Record<string, number[]>;
  diagnostics?: Record<string, Diagnostic[]>;
}

export interface WorkspaceCache extends PanesState<PaneType> {
  project: ProjectState;
  screen: ScreenState;
  sync: SyncState;
  debug: DebugState;
  preview: PreviewState;
}
