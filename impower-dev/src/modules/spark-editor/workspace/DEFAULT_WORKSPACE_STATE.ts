import { WorkspaceState } from "./types/WorkspaceState";

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  setup: {
    panel: "details",
    panels: {
      details: {
        editingPath: "",
        scrollIndex: 0,
      },
      share: {
        scrollIndex: 0,
      },
      assets: {
        scrollIndex: 0,
      },
    },
  },
  audio: {
    panel: "sounds",
    panels: {
      sounds: {
        editingPath: "",
        scrollIndex: 0,
      },
      music: {
        editingPath: "",
        scrollIndex: 0,
      },
    },
  },
  displays: {
    panel: "widgets",
    panels: {
      widgets: {
        editingPath: "",
        scrollIndex: 0,
      },
      views: {
        editingPath: "",
        scrollIndex: 0,
      },
    },
  },
  graphics: {
    panel: "sprites",
    panels: {
      sprites: {
        editingPath: "",
        scrollIndex: 0,
      },
      maps: {
        editingPath: "",
        scrollIndex: 0,
      },
    },
  },
  logic: {
    panel: "main",
    panels: {
      main: {
        scrollIndex: 0,
      },
      scripts: {
        editingPath: "",
        scrollIndex: 0,
      },
    },
  },
  preview: {
    panel: "game",
    panels: {
      game: {},
      screenplay: {},
      file: {},
    },
  },
};
