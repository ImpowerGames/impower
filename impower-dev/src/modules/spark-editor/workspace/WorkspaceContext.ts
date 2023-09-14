import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import Context from "../../../../../packages/spec-component/src/classes/Context";
import { RecursiveReadonly } from "./types/RecursiveReadonly";

export default class WorkspaceContext extends Context<WorkspaceStore> {
  private static _instance: WorkspaceContext;
  static get instance(): WorkspaceContext {
    if (!this._instance) {
      this._instance = new WorkspaceContext();
    }
    return this._instance;
  }

  readonly event = "update:workspace";

  protected _store: WorkspaceStore = {
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
  };

  override get(): RecursiveReadonly<WorkspaceStore> {
    return this._store;
  }

  override set(v: WorkspaceStore) {
    this._store = v;
    this.root.dispatchEvent(
      new CustomEvent(this.event, { detail: this._store })
    );
  }
}
