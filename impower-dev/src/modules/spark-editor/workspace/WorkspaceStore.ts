import { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import Store from "../../../../../packages/spec-component/src/mixins/Store";

class WorkspaceStore extends Store({
  project: { id: "" },
  pane: "setup",
  panes: {
    setup: {
      panel: "details",
      panels: {
        details: {
          activeEditor: {},
        },
        share: {
          activeEditor: {},
        },
        assets: {
          activeEditor: {},
        },
      },
    },
    audio: {
      view: "list",
      panel: "sounds",
      panels: {
        sounds: {
          scrollIndex: 0,
          activeEditor: {},
        },
        music: {
          scrollIndex: 0,
          activeEditor: {},
        },
      },
    },
    displays: {
      view: "list",
      panel: "widgets",
      panels: {
        widgets: {
          scrollIndex: 0,
          activeEditor: {},
        },
        views: {
          scrollIndex: 0,
          activeEditor: {},
        },
      },
    },
    graphics: {
      view: "list",
      panel: "sprites",
      panels: {
        sprites: {
          scrollIndex: 0,
          activeEditor: {},
        },
        maps: {
          scrollIndex: 0,
          activeEditor: {},
        },
      },
    },
    logic: {
      view: "list",
      panel: "main",
      panels: {
        main: {
          scrollIndex: 0,
          activeEditor: {
            open: true,
            filename: "main.script",
          },
        },
        scripts: {
          scrollIndex: 0,
          activeEditor: {},
        },
      },
    },
  },
  preview: {
    mode: "game",
    modes: {
      page: {},
      game: {},
      screenplay: {},
      file: {},
    },
  },
} as WorkspaceCache) {}

export default new WorkspaceStore();
