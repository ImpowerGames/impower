import type { Range } from "vscode-languageserver-protocol";

export interface GameState {
  running?: boolean;
  paused?: boolean;
  debugging?: boolean;
  compiling?: boolean;
}

export interface PanelState extends Record<string, any> {
  scrollIndex?: number;
  activeEditor?: {
    open?: boolean;
    filename?: string;
    visibleRange?: Range;
    selectedRange?: Range;
  };
}

export interface PaneState {
  view?: string;
  panel: string;
  panels: Record<string, PanelState>;
}

export interface WorkspacePanes extends Record<string, PaneState> {
  setup: {
    panel: string;
    panels: {
      details: {
        scrollIndex?: number;
        activeEditor: {
          open?: boolean;
          filename?: string;
          visibleRange?: Range;
          selectedRange?: Range;
        };
      };
      share: {
        scrollIndex?: number;
      };
      assets: {
        scrollIndex?: number;
        activeEditor: {
          open?: boolean;
          filename?: string;
          visibleRange?: Range;
          selectedRange?: Range;
        };
      };
    };
  };
  audio: {
    view: string;
    panel: string;
    panels: {
      sounds: {
        scrollIndex?: number;
        activeEditor: {
          open?: boolean;
          filename?: string;
          visibleRange?: Range;
          selectedRange?: Range;
        };
      };
      music: {
        scrollIndex?: number;
        activeEditor: {
          open?: boolean;
          filename?: string;
          visibleRange?: Range;
          selectedRange?: Range;
        };
      };
    };
  };
  displays: {
    view: string;
    panel: string;
    panels: {
      widgets: {
        scrollIndex?: number;
        activeEditor: {
          filename?: string;
          visibleRange?: Range;
          selectedRange?: Range;
        };
      };
      views: {
        scrollIndex?: number;
        activeEditor: {
          open?: boolean;
          filename?: string;
          visibleRange?: Range;
          selectedRange?: Range;
        };
      };
    };
  };
  graphics: {
    view: string;
    panel: string;
    panels: {
      sprites: {
        scrollIndex?: number;
        activeEditor: {
          open?: boolean;
          filename?: string;
          visibleRange?: Range;
          selectedRange?: Range;
        };
      };
      maps: {
        scrollIndex?: number;
        activeEditor: {
          open?: boolean;
          filename?: string;
          visibleRange?: Range;
          selectedRange?: Range;
        };
      };
    };
  };
  logic: {
    view: string;
    panel: string;
    panels: {
      main: {
        scrollIndex?: number;
        activeEditor: {
          open?: boolean;
          filename?: string;
          visibleRange?: Range;
          selectedRange?: Range;
        };
      };
      scripts: {
        scrollIndex?: number;
        activeEditor: {
          open?: boolean;
          filename?: string;
          visibleRange?: Range;
          selectedRange?: Range;
        };
      };
    };
  };
  preview: {
    revealed?: boolean;
    panel: string;
    panels: {
      page: {};
      game: GameState;
      screenplay: {
        visibleRange?: Range;
      };
      file: {};
    };
  };
}

export type SyncState =
  | "cached"
  | "unsaved"
  | "saved"
  | "loading"
  | "importing"
  | "exporting"
  | "syncing"
  | "load_error"
  | "import_error"
  | "export_error"
  | "sync_error"
  | "sync_conflict";

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
  syncedAt?: string;
  conflict?: {
    remote?: ProjectFile;
    local?: ProjectFile;
  };
}

export interface WorkspaceState {
  project: ProjectState;
  pane: string;
  panes: WorkspacePanes;
}
