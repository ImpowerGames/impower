interface Range {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface WorkspaceState
  extends Record<
    string,
    {
      view?: string;
      panel: string;
      panels: Record<
        string,
        {
          visibleRange?: Range;
          openFilePath?: string;
        }
      >;
    }
  > {
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
      game: {};
      screenplay: {
        visibleRange?: Range;
      };
      file: {};
    };
  };
}
