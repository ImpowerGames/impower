import { Range } from "@impower/spark-editor-protocol/src/types";

export interface PanelState extends Record<string, any> {
  visibleRange?: Range | undefined;
  selectedRange?: Range | undefined;
  openFilePath?: string | undefined;
}

export interface PaneState {
  view?: string | undefined;
  panel: string;
  panels: Record<string, PanelState>;
}

export interface WorkspacePanes extends Record<string, PaneState> {
  setup: {
    panel: string;
    panels: {
      details: {
        visibleRange?: Range;
      };
      share: {
        visibleRange?: Range;
      };
      assets: {
        visibleRange?: Range;
      };
    };
  };
  audio: {
    view: string;
    panel: string;
    panels: {
      sounds: {
        visibleRange?: Range;
        openFilePath: string;
      };
      music: {
        visibleRange?: Range;
        openFilePath: string;
      };
    };
  };
  displays: {
    view: string;
    panel: string;
    panels: {
      widgets: {
        visibleRange?: Range;
        openFilePath: string;
      };
      views: {
        visibleRange?: Range;
        openFilePath: string;
      };
    };
  };
  graphics: {
    view: string;
    panel: string;
    panels: {
      sprites: {
        visibleRange?: Range;
        openFilePath: string;
      };
      maps: {
        visibleRange?: Range;
        openFilePath: string;
      };
    };
  };
  logic: {
    view: string;
    panel: string;
    panels: {
      main: {
        visibleRange?: Range;
        openFilePath: string;
      };
      scripts: {
        visibleRange?: Range;
        openFilePath: string;
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
  header: { projectName: string; editingProjectName?: boolean };
  pane: string;
  panes: WorkspacePanes;
}
