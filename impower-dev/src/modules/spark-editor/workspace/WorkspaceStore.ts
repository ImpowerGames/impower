import {
  computed,
  effect,
  signal,
  type ReadonlySignal,
  type Signal,
} from "@preact/signals";
import type {
  SyncStatus,
  WorkspaceCache,
} from "@impower/spark-editor-protocol/src/types";
import type { EditorBreakpoint } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorBreakpointsMessage";
import type { DebugVariableNode } from "@impower/spark-web-player/src/components/DebugVariables/DebugVariables";
import type { GameHistory } from "@impower/spark-engine/src/game/core/types/RunHistory";
import type { DebugProtocol } from "@vscode/debugprotocol";
import { layoutState, type Layout } from "@impower/impower-ui/layout";
import type {
  Diagnostic,
  DocumentSymbol,
} from "vscode-languageserver-protocol";
import type { ReplaceProjectRequest } from "./replaceProject";
import type { AccountInfo } from "./types/AccountInfo";
import type { AssetListing } from "./assetsListing";
import type { ScriptListing } from "./scriptsListing";
import type { Reference } from "../utils/fileListModel";
import {
  INITIAL_SEARCH,
  INITIAL_SEARCH_POSITION,
  type SearchPosition,
  type SearchSnapshot,
} from "./searchState";
import { WorkspaceConstants } from "./WorkspaceConstants";

export type ScriptMode = "reading" | "editing";

export interface KeyboardPanel {
  heading: boolean;
}

export interface OutlineSnapshot {
  uri: string;
  symbols: readonly DocumentSymbol[];
  diagnostics: readonly Diagnostic[];
  firstContentLine: number | undefined;
}

export interface DebugSessionState {
  stopped: DebugProtocol.StoppedEvent["body"] | null;
  stackTrace: DebugProtocol.StackTraceResponse["body"] | null;
  history: GameHistory | null;
  breakpoints: Record<string, EditorBreakpoint[]>;
}

export const IDLE_DEBUG_SESSION: DebugSessionState = {
  stopped: null,
  stackTrace: null,
  history: null,
  breakpoints: {},
};

export interface InspectedFrame {
  id: number;
  name: string;
  uri: string;
  line: number;
  character: number;
  path: string;
  inProject: boolean;
}

export type WatchResult = { value: string } | { error: string };

export interface DebugInspectionState {
  status: "none" | "running" | "paused";
  frames: readonly InspectedFrame[];
  frameId: number | null;
  variables: readonly DebugVariableNode[];
  editing: string | null;
  watch: ReadonlyMap<string, WatchResult>;
  watchEditing: number | null;
}

export const IDLE_DEBUG_INSPECTION: DebugInspectionState = {
  status: "none",
  frames: [],
  frameId: null,
  variables: [],
  editing: null,
  watch: new Map(),
  watchEditing: null,
};

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

  readonly scriptListing = signal<ScriptListing | null>(null);

  readonly scriptReferences = signal<readonly Reference[]>([]);

  readonly assetListing = signal<AssetListing | null>(null);

  readonly search = signal<SearchSnapshot>(INITIAL_SEARCH);

  readonly searchPosition = signal<SearchPosition>(INITIAL_SEARCH_POSITION);

  readonly scriptMode = signal<ScriptMode>("reading");

  private _layout: Signal<Layout> | undefined;

  get layout(): Signal<Layout> {
    if (!this._layout) {
      const layout = signal<Layout>(layoutState.current());
      layoutState.subscribe((next) => {
        layout.value = next;
      });
      this._layout = layout;
    }
    return this._layout;
  }

  readonly effectiveScriptMode = computed<ScriptMode | undefined>(() =>
    this.layout.value === "phone" ? this.scriptMode.value : undefined,
  );

  readonly keyboardPanels = signal<readonly KeyboardPanel[]>([]);

  addKeyboardPanel(panel: KeyboardPanel): () => void {
    this.keyboardPanels.value = [...this.keyboardPanels.peek(), panel];
    return () => {
      this.keyboardPanels.value = this.keyboardPanels
        .peek()
        .filter((entry) => entry !== panel);
    };
  }

  readonly editorHistory = signal<
    Record<string, { canUndo: boolean; canRedo: boolean }>
  >({});

  readonly outline = signal<OutlineSnapshot | null>(null);

  readonly syncConflictOpen = signal<boolean>(false);

  readonly syncedAt = signal<number | null>(null);

  readonly replaceProject = signal<ReplaceProjectRequest | null>(null);

  readonly storyFrontMatter = signal<Readonly<Record<string, readonly string[]>>>({});

  readonly debugSession = signal<DebugSessionState>(IDLE_DEBUG_SESSION);

  readonly debugInspection = signal<DebugInspectionState>(IDLE_DEBUG_INSPECTION);

  readonly watchExpressions = computed<readonly string[]>(
    () => this.state.value.debug?.watch ?? [],
  );

  readonly signals = {
    pane: computed(() => this.state.value.pane ?? "logic"),
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
