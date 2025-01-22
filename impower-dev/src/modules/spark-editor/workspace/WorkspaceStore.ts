import { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import Store from "../../../../../packages/spec-component/src/mixins/Store";

const cache: WorkspaceCache = {
  project: { id: "" },
  pane: "logic",
  panes: {
    logic: {
      view: "list",
      panel: "main",
      panels: {
        main: {
          scrollIndex: 0,
          activeEditor: {
            open: true,
            filename: "main.sd",
          },
        },
        scripts: {
          scrollIndex: 0,
          activeEditor: {},
        },
      },
    },
    assets: {
      panel: "files",
      panels: {
        files: {
          activeEditor: {},
        },
        urls: {
          activeEditor: {},
        },
      },
    },
    share: {
      panel: "game",
      panels: {
        game: {
          activeEditor: {},
        },
        screenplay: {
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
  screen: {},
  sync: {},
  debug: {},
};

class WorkspaceStore extends Store(cache) {}

const workspace = new WorkspaceStore();

export default workspace;
