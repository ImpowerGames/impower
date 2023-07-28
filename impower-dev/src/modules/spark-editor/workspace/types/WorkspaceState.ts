export interface WorkspaceState
  extends Record<
    string,
    {
      panel: string;
      panels: Record<string, { scrollIndex?: number; editingPath?: string }>;
    }
  > {
  setup: {
    panel: string;
    panels: {
      details: {
        scrollIndex?: number;
        editingPath?: string;
      };
      share: {
        scrollIndex?: number;
        editingPath?: string;
      };
      assets: {
        scrollIndex?: number;
        editingPath?: string;
      };
    };
  };
  audio: {
    panel: string;
    panels: {
      sounds: {
        scrollIndex?: number;
        editingPath?: string;
      };
      music: {
        scrollIndex?: number;
        editingPath?: string;
      };
    };
  };
  displays: {
    panel: string;
    panels: {
      widgets: {
        scrollIndex?: number;
        editingPath?: string;
      };
      views: {
        scrollIndex?: number;
        editingPath?: string;
      };
    };
  };
  graphics: {
    panel: string;
    panels: {
      sprites: {
        scrollIndex?: number;
        editingPath?: string;
      };
      maps: {
        scrollIndex: number;
        editingPath?: string;
      };
    };
  };
  logic: {
    panel: string;
    panels: {
      main: {
        scrollIndex?: number;
        editingPath?: string;
      };
      scripts: {
        scrollIndex: number;
        editingPath?: string;
      };
    };
  };
  preview: {
    panel: string;
    panels: {
      game: {
        scrollIndex?: number;
      };
      screenplay: {
        scrollIndex?: number;
      };
      file: {
        scrollIndex?: number;
      };
    };
  };
}
