export interface WorkspaceState {
  setup: {
    panel: string;
    panels: {
      details: {
        open?: string;
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
    panel: string;
    panels: {
      sounds: {
        open?: string;
        scrollIndex: number;
      };
      music: {
        open?: string;
        scrollIndex: number;
      };
    };
  };
  displays: {
    panel: string;
    panels: {
      widgets: {
        open?: string;
        scrollIndex: number;
      };
      views: {
        open?: string;
        scrollIndex: number;
      };
    };
  };
  graphics: {
    panel: string;
    panels: {
      sprites: {
        open?: string;
        scrollIndex: number;
      };
      maps: {
        open?: string;
        scrollIndex: number;
      };
    };
  };
  logic: {
    panel: string;
    panels: {
      main: {
        scrollIndex: number;
      };
      scripts: {
        open?: string;
        scrollIndex: number;
      };
    };
  };
  preview: {
    panel: string;
    panels: {
      game: {};
      screenplay: {
        scrollIndex: number;
      };
    };
  };
}
