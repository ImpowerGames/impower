import { computed, signal, type ReadonlySignal } from "@preact/signals";
// Type-only import — `WorkspaceCache` is just a TS shape, and the runtime
// re-exports in `@impower/spark-editor-protocol/src/types` reach into
// `vscode-languageserver-protocol` (CJS) which crashes Vite SSR.
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

// Signals-based workspace store. `state` is the single source of truth;
// `signals` exposes pre-derived slices so a component can subscribe to a
// narrow value (e.g. `projectId`) without re-rendering the whole shell on
// every workspace mutation. `current` is a convenience snapshot accessor.
class WorkspaceStore {
  // The single source of truth for persisted workspace layout.
  readonly state = signal<WorkspaceCache>(cache);

  // Signed-in Google account, or null. Deliberately a SEPARATE signal rather
  // than a field on `state`/`WorkspaceCache`: this is ephemeral session auth,
  // not persisted workspace layout, and `AccountInfo` carries an OAuth `token`
  // that must never be serialized to localStorage. Keeping it out of the
  // persisted cache makes that structurally impossible. Written via
  // `Workspace.window.setAccount()` / `clearAccount()`; read through the
  // derived `signals.account` / `signals.signinLabel` below.
  readonly account = signal<AccountInfo | null>(null);

  // Pre-built derived signals for the shell's most common slices. Each is a
  // ReadonlySignal so consumers can't mutate them directly — write the whole
  // cache via `current =`, or go through the message-protocol handlers.
  readonly signals = {
    pane: computed(() => this.state.value.pane ?? "logic"),
    previewMode: computed(() => this.state.value.preview?.mode ?? "game"),
    projectId: computed(() => this.state.value.project?.id ?? ""),
    syncStatus: computed(() => this.state.value.sync?.status),
    // The usable signed-in account: only present once the user has a uid AND
    // has consented. Mirrors the old `applyAccountInfo` gate in Account.tsx.
    account: computed<AccountInfo | null>(() => {
      const info = this.account.value;
      return info && info.uid && info.consented ? info : null;
    }),
    // The signed-out CTA label: "Grant Access" when a uid exists but consent
    // was withdrawn (the previously-signed-in-but-revoked case), else "Sync".
    signinLabel: computed(() => {
      const info = this.account.value;
      return info && info.uid && !info.consented
        ? "Grant Access To Google Drive"
        : "Sync With Google Drive";
    }),
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
