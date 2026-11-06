import { computed, effect, signal, type ReadonlySignal } from "@preact/signals";
import type {
  SyncStatus,
  WorkspaceCache,
} from "@impower/spark-editor-protocol/src/types";
import type { AccountInfo } from "./types/AccountInfo";
import { WorkspaceConstants } from "./WorkspaceConstants";

const defaults: WorkspaceCache = {
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

export const cacheableWorkspaceState = (
  store: WorkspaceCache,
): WorkspaceCache => {
  const copy = structuredClone(store);
  copy.screen = {};
  copy.sync = {};
  copy.debug.diagnosticsSummary = {};
  copy.debug.pinpoints = {};
  copy.debug.highlights = {};
  copy.preview.modes.game = {};
  return copy;
};

export const loadedProjectId = (): string =>
  localStorage.getItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY) ||
  WorkspaceConstants.LOCAL_PROJECT_ID;

export const savedWorkspaceState = (): WorkspaceCache => {
  if (typeof window === "undefined") {
    return defaults;
  }
  const id = loadedProjectId();
  const saved = localStorage.getItem(
    WorkspaceConstants.WORKSPACE_STATE_STORAGE_KEY_PREFIX + id,
  );
  if (!saved) {
    return { ...defaults, project: { ...defaults.project, id } };
  }
  return cacheableWorkspaceState(JSON.parse(saved) as WorkspaceCache);
};

class WorkspaceStore {
  readonly state = signal<WorkspaceCache>(savedWorkspaceState());

  readonly account = signal<AccountInfo | null>(null);

  readonly importProgress = signal<{ loaded: number; total: number } | null>(
    null,
  );

  readonly trashOpen = signal<boolean>(false);

  readonly animatePortraits = signal<boolean>(true);

  readonly syncConflictOpen = signal<boolean>(false);

  readonly syncedAt = signal<number | null>(null);

  readonly storyFrontMatter = signal<Readonly<Record<string, readonly string[]>>>({});

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
        ? "Grant access to Google Drive"
        : "Sync with Google Drive";
    }),
  } as const satisfies Record<string, ReadonlySignal<unknown>>;

  constructor() {
    let previous: SyncStatus | undefined;
    effect(() => {
      const status = this.signals.syncStatus.value;
      if (status === previous) {
        return;
      }
      previous = status;
      if (status === "synced") {
        this.syncedAt.value = Date.now();
      }
      this.syncConflictOpen.value = status === "sync_conflict";
    });
  }

  get current(): WorkspaceCache {
    return this.state.peek();
  }
  set current(v: WorkspaceCache) {
    this.state.value = v;
  }
}

const workspace = new WorkspaceStore();

export default workspace;
