import { computed, signal, type ReadonlySignal } from "@preact/signals";
import { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import { emit } from "../../../../../packages/spec-component/src/utils/emit";
import { IStore } from "../../../../../packages/spec-component/src/types/IStore";

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

const STORE_EVENT = "update:store";

// Signals-based workspace store.
//
// Two reader paths coexist:
//   * Legacy spec-components read `workspace.current` (an unreactive snapshot
//     of the cache) and re-render via the `update:store` window event.
//     `WorkspaceWindow.ts` writes via `workspace.current = newCache`.
//   * New Preact components subscribe to fine-grained signals — `state` for
//     the whole cache, plus the named derived signals (`pane`, `previewMode`,
//     etc.) on `signals` for narrow subscriptions that don't re-render the
//     whole shell every workspace mutation.
class WorkspaceStore implements IStore<WorkspaceCache> {
  // The single source of truth.
  readonly state = signal<WorkspaceCache>(cache);

  // Pre-built derived signals for the shell's most common slices. Each is a
  // ReadonlySignal so consumers can't mutate them directly — go through
  // `current =` like the legacy code, or call the message-protocol handlers.
  readonly signals = {
    pane: computed(() => this.state.value.pane ?? "logic"),
    previewMode: computed(() => this.state.value.preview?.mode ?? "game"),
    projectId: computed(() => this.state.value.project?.id ?? ""),
    syncStatus: computed(() => this.state.value.sync?.status),
  } as const satisfies Record<string, ReadonlySignal<unknown>>;

  // ---- IStore<WorkspaceCache> back-compat surface ----

  readonly event = STORE_EVENT;
  // `target` is a getter (not a field initializer) so `window` is read lazily
  // — impower-dev's build pipeline SSR-evaluates this module and `window` is
  // undefined there.
  get target(): EventTarget {
    return globalThis as unknown as EventTarget;
  }

  get current(): WorkspaceCache {
    // Unreactive read for legacy spec-component consumers. They get the
    // current snapshot and re-render on the `update:store` event.
    return this.state.peek();
  }
  set current(v: WorkspaceCache) {
    this.state.value = v;
    emit(this.event, v, this.target);
  }
}

const workspace = new WorkspaceStore();

export default workspace;
