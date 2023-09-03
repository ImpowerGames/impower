import { Range } from "@impower/spark-editor-protocol/src/types";

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
      game: {
        running?: boolean;
        paused?: boolean;
        debugging?: boolean;
        compiling?: boolean;
      };
      screenplay: {
        visibleRange?: Range;
      };
      file: {};
    };
  };
}

export interface WorkspaceState {
  header: {
    projectName: string;
    editingProjectName?: boolean;
    persistenceState: string;
  };
  pane: string;
  panes: WorkspacePanes;
}
