import type {
  Diagnostic,
  MarkupContent,
  Range,
} from "vscode-languageserver-protocol";
// Type-only imports (erased at build) — keep the protocol package free of a
// runtime dependency on spark-engine.
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import type { StackFrame } from "@impower/spark-engine/src/game/core/types/StackFrame";
import type { Thread } from "@impower/spark-engine/src/game/core/types/Thread";
import type { Variable } from "@impower/spark-engine/src/game/core/types/Variable";

/** Live debug-session snapshot while the game is suspended at a breakpoint or
    step. Session-only (never persisted): StackFrame ids and Variable
    `variablesReference`s are only valid while execution remains suspended. */
export interface DebugSessionState {
  paused: boolean;
  threadId?: number;
  stoppedLocation?: DocumentLocation;
  threads?: Thread[];
  stackFrames?: StackFrame[];
  scopes?: {
    vars?: Variable[];
    temps?: Variable[];
    lists?: Variable[];
    defines?: Variable[];
  };
  /** Pre-fetched children for structured values, keyed by variablesReference. */
  childrenByRef?: Record<number, Variable[]>;
}

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
  originalFilename?: string;
  filename?: string;
  open?: boolean;
  focused?: boolean;
  visibleRange?: Range | "nearest" | "start" | "end" | "center";
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
  simulationOptions?: Record<
    string,
    {
      favoredChoices?: (number | undefined)[];
      favoredConditions?: (boolean | undefined)[];
    }
  >;
  breakpoints?: Record<string, number[]>;
  pinpoints?: Record<string, number[]>;
  highlights?: Record<string, number[]>;
  diagnostics?: Record<
    string,
    (Omit<Diagnostic, "message"> & { message: string | MarkupContent })[]
  >;
  /** Live debug-session state (set while suspended; never persisted). */
  session?: DebugSessionState;
}

export interface WorkspaceCache extends PanesState<PaneType> {
  project: ProjectState;
  screen: ScreenState;
  sync: SyncState;
  debug: DebugState;
  preview: PreviewState;
}
