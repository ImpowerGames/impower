import { computed, signal, type ReadonlySignal } from "@preact/signals";
// Type-only import — `WorkspaceCache` is just a TS shape, and the runtime
// re-exports in `@impower/spark-editor-protocol/src/types` reach into
// `vscode-languageserver-protocol` (CJS) which crashes Vite SSR.
import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";

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

// Signals-based workspace store. `state` is the single source of truth;
// `signals` exposes pre-derived slices so a component can subscribe to a
// narrow value (e.g. `projectId`) without re-rendering the whole shell on
// every workspace mutation. `current` is a convenience snapshot accessor.
class WorkspaceStore {
  // The single source of truth.
  readonly state = signal<WorkspaceCache>(cache);

  // Pre-built derived signals for the shell's most common slices. Each is a
  // ReadonlySignal so consumers can't mutate them directly — write the whole
  // cache via `current =`, or go through the message-protocol handlers.
  readonly signals = {
    pane: computed(() => this.state.value.pane ?? "logic"),
    previewMode: computed(() => this.state.value.preview?.mode ?? "game"),
    projectId: computed(() => this.state.value.project?.id ?? ""),
    syncStatus: computed(() => this.state.value.sync?.status),
  } as const satisfies Record<string, ReadonlySignal<unknown>>;

  /** Non-reactive snapshot read of the whole cache. */
  get current(): WorkspaceCache {
    return this.state.peek();
  }
  /** Replace the whole cache (the write path). */
  set current(v: WorkspaceCache) {
    this.state.value = v;
  }
}

const workspace = new WorkspaceStore();

export default workspace;
