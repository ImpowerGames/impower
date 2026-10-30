import { computed, signal, type ReadonlySignal } from "@preact/signals";
import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import type { AccountInfo } from "./types/AccountInfo";

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

class WorkspaceStore {
  readonly state = signal<WorkspaceCache>(cache);

  readonly account = signal<AccountInfo | null>(null);

  readonly importProgress = signal<{ loaded: number; total: number } | null>(
    null,
  );

  readonly trashOpen = signal<boolean>(false);

  readonly animatePortraits = signal<boolean>(true);

  readonly signals = {
    pane: computed(() => this.state.value.pane ?? "logic"),
    previewMode: computed(() => this.state.value.preview?.mode ?? "game"),
    projectId: computed(() => this.state.value.project?.id ?? ""),
    syncStatus: computed(() => this.state.value.sync?.status),
    account: computed<AccountInfo | null>(() => {
      const info = this.account.value;
      return info && info.uid && info.consented ? info : null;
    }),
    signinLabel: computed(() => {
      const info = this.account.value;
      return info && info.uid && !info.consented
        ? "Grant Access To Google Drive"
        : "Sync With Google Drive";
    }),
  } as const satisfies Record<string, ReadonlySignal<unknown>>;

  get current(): WorkspaceCache {
    return this.state.peek();
  }
  set current(v: WorkspaceCache) {
    this.state.value = v;
  }
}

const workspace = new WorkspaceStore();

export default workspace;
