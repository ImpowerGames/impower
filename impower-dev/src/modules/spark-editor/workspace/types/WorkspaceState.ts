export interface WorkspaceState
  extends Record<
    string,
    {
      view?: string;
      panel: string;
      panels: Record<string, { scrollIndex?: number; openFilePath?: string }>;
    }
  > {
  setup: {
    panel: string;
    panels: {
      details: {
        scrollIndex: number;
      };
      share: {
        scrollIndex: number;
      };
      assets: {
        scrollIndex: number;
      };
    };
  };
  audio: {
    view: string;
    panel: string;
    panels: {
      sounds: {
        scrollIndex: number;
        openFilePath: string;
      };
      music: {
        scrollIndex: number;
        openFilePath: string;
      };
    };
  };
  displays: {
    view: string;
    panel: string;
    panels: {
      widgets: {
        scrollIndex: number;
        openFilePath: string;
      };
      views: {
        scrollIndex: number;
        openFilePath: string;
      };
    };
  };
  graphics: {
    view: string;
    panel: string;
    panels: {
      sprites: {
        scrollIndex: number;
        openFilePath: string;
      };
      maps: {
        scrollIndex: number;
        openFilePath: string;
      };
    };
  };
  logic: {
    view: string;
    panel: string;
    panels: {
      main: {
        scrollIndex: number;
      };
      scripts: {
        scrollIndex: number;
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
        scrollIndex: number;
      };
      file: {};
    };
  };
}
