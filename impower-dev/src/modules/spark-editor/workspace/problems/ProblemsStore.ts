import { layoutState } from "@impower/impower-ui/layout";
import { fixActionsOf } from "@impower/codemirror-vscode-lsp-client/src/diagnostics";
import { ChoseEditorFixMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChoseEditorFixMessage";
import { RequestedEditorToolMessage } from "@impower/spark-editor-protocol/src/protocols/editor/RequestedEditorToolMessage";
import { computed, signal } from "@preact/signals";
import type { Diagnostic } from "vscode-languageserver-protocol";
import {
  countDiagnostics,
  countProblems,
  type DiagnosticCounts,
} from "../problemCounts";
import { PROJECT_SETTINGS_SCHEMA } from "../settings/settingsSchema";
import workspaceSettings from "../settings/WorkspaceSettings";
import { WorkspaceConstants } from "../WorkspaceConstants";
import workspace from "../WorkspaceStore";
import { CLIPBOARD_UNAVAILABLE } from "@impower/spark-web-player/src/components/PlayerConsole/PlayerConsole";
import { showSnackbar } from "../../utils/snackbar";
import { applyFix, type FixChoice } from "./applyFix";
import {
  CONSOLE_SEVERITIES,
  formatConsoleLog,
  isChoiceEntry,
  PLAYED_LIMIT,
  plural,
  toProblems,
  type CardName,
  type ConsoleSeverity,
  type PanelCard,
  type PlayedEntry,
  type PlayedInput,
  type ProblemsScope,
} from "./problemEntries";

export const PANEL_BAR_HEIGHT =
  PROJECT_SETTINGS_SCHEMA.previewPanelHeight.default;

export const PANEL_OPEN_HEIGHT = 260;

export const STRIP_ABOVE_PANEL = 300;

export interface ProblemsDialogState {
  scope: ProblemsScope;
  returnFocus?: () => HTMLElement | null;
}

export type PlayedSource = (message: unknown) => PlayedInput | null;

export type RunSource = (message: unknown) => boolean;

export type PanelSource = (message: unknown) => boolean | null;

export type PreviewPanel = "problems" | "route";

const CARD_SETTING = {
  script: "problemsScriptCardOpen",
  played: "problemsPlayedCardOpen",
  variables: "problemsVariablesCardOpen",
  watch: "problemsWatchCardOpen",
  callStack: "problemsCallStackCardOpen",
} as const satisfies Record<CardName, string>;

export class ProblemsStore {
  readonly diagnostics = signal<
    Readonly<Record<string, readonly Diagnostic[]>>
  >({});

  readonly versions = signal<Readonly<Record<string, number>>>({});

  readonly played = signal<readonly PlayedEntry[]>([]);

  readonly run = signal(0);

  readonly heldChoices = computed(
    () => workspace.debugSession.value.history?.heldChoices ?? null,
  );

  readonly shown = signal<Readonly<Record<ConsoleSeverity, boolean>>>({
    error: true,
    warning: true,
    info: true,
  });

  readonly dialog = signal<ProblemsDialogState | null>(null);

  readonly reveal = signal<{ card: PanelCard; serial: number } | null>(null);

  readonly problems = computed(() =>
    toProblems(this.diagnostics.value, this.versions.value),
  );

  readonly visiblePlayed = computed(() =>
    this.played.value.filter(
      (entry) => isChoiceEntry(entry) || this.shown.value[entry.severity],
    ),
  );

  readonly summary = computed(() => {
    const summary: Record<string, DiagnosticCounts> = {};
    for (const [uri, list] of Object.entries(this.diagnostics.value)) {
      summary[uri] = countDiagnostics(list);
    }
    return summary;
  });

  readonly counts = computed(() => countProblems(this.summary.value));

  readonly panelOpen = computed(
    () =>
      workspaceSettings.projectSettings.value.previewPanelHeight >
      PANEL_BAR_HEIGHT,
  );

  readonly panelShows = signal<PreviewPanel>("problems");

  readonly problemsShown = computed(
    () => this.panelOpen.value && this.panelShows.value === "problems",
  );

  readonly routeShown = computed(
    () => this.panelOpen.value && this.panelShows.value === "route",
  );

  readonly cards = computed<Readonly<Record<CardName, boolean>>>(() => {
    const settings = workspaceSettings.projectSettings.value;
    return {
      script: settings[CARD_SETTING.script],
      played: settings[CARD_SETTING.played],
      variables: settings[CARD_SETTING.variables],
      watch: settings[CARD_SETTING.watch],
      callStack: settings[CARD_SETTING.callStack],
    };
  });

  protected _serial = 0;

  protected _openHeight = PANEL_OPEN_HEIGHT;

  protected readonly _playedSources = new Set<PlayedSource>();

  protected readonly _panelSources = new Set<PanelSource>();

  protected readonly _runSources = new Set<RunSource>();

  record({
    uri,
    diagnostics,
    version,
  }: {
    uri: string;
    diagnostics: readonly Diagnostic[];
    version?: number | null;
  }) {
    if (this.versions.value[uri] !== (version ?? undefined)) {
      const versions = { ...this.versions.value };
      if (version == null) {
        delete versions[uri];
      } else {
        versions[uri] = version;
      }
      this.versions.value = versions;
    }
    const next = { ...this.diagnostics.value };
    if (diagnostics.length) {
      next[uri] = diagnostics;
    } else if (uri in next) {
      delete next[uri];
    } else {
      return;
    }
    this.diagnostics.value = next;
  }

  recordPlayed(entry: PlayedInput, time = Date.now()) {
    const recorded: PlayedEntry = { ...entry, id: ++this._serial, time };
    if (entry.checkpoint != null) {
      recorded.run = this.run.value;
    }
    const next = [...this.played.value, recorded];
    this.played.value =
      next.length > PLAYED_LIMIT ? next.slice(-PLAYED_LIMIT) : next;
    if (entry.severity === "error" && this.shown.value.error) {
      this.openPanel("played");
    } else if (this.panelOpen.value) {
      this.revealCard("played");
    }
  }

  clearPlayed() {
    if (!this.played.value.length) {
      return;
    }
    this.played.value = [];
    showSnackbar({ message: "Played messages cleared." });
  }

  async copyPlayed() {
    const list = this.visiblePlayed.value;
    if (!list.length) {
      return;
    }
    try {
      if (!navigator.clipboard) {
        throw new Error(CLIPBOARD_UNAVAILABLE);
      }
      await navigator.clipboard.writeText(formatConsoleLog(list));
      showSnackbar({ message: `Copied ${plural(list.length, "message")}.` });
    } catch {
      showSnackbar({ message: CLIPBOARD_UNAVAILABLE });
    }
  }

  savePlayed(now = new Date()) {
    const list = this.visiblePlayed.value;
    if (!list.length) {
      return;
    }
    const shown = CONSOLE_SEVERITIES.filter((s) => this.shown.value[s]);
    const selection =
      shown.length === CONSOLE_SEVERITIES.length ? "all" : shown.join("-");
    const url = URL.createObjectURL(
      new Blob([formatConsoleLog(list)], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `spark-played-${selection}-${now.toISOString().replace(/[:.]/g, "-")}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  setShown(severity: ConsoleSeverity, shown: boolean) {
    this.shown.value = { ...this.shown.value, [severity]: shown };
  }

  setCardOpen(card: CardName, open: boolean) {
    workspaceSettings.setProjectSetting(CARD_SETTING[card], open);
  }

  rememberPanelHeight(height: number) {
    if (height > PANEL_BAR_HEIGHT) {
      this._openHeight = height;
    }
  }

  showPanel(panel: PreviewPanel) {
    const layout = layoutState.current();
    if (layout === "phone") {
      return false;
    }
    this.panelShows.value = panel;
    if (!this.panelOpen.value) {
      workspaceSettings.setProjectSetting("previewPanelHeight", this._openHeight);
    }
    if (layout === "compact") {
      this.makeRoomInStrip();
    }
    return true;
  }

  toggleRoute() {
    if (this.routeShown.value) {
      this.collapsePanel();
      return true;
    }
    return this.showPanel("route");
  }

  openPanel(card?: PanelCard) {
    if (!this.showPanel("problems")) {
      return false;
    }
    if (card) {
      if (!this.cards.value[card]) {
        this.setCardOpen(card, true);
      }
      this.revealCard(card);
    }
    return true;
  }

  makeRoomInStrip() {
    const strip =
      workspace.state.value.shell?.stripHeight ??
      WorkspaceConstants.PREVIEW_STRIP_HEIGHT.default;
    const room =
      workspaceSettings.projectSettings.value.previewPanelHeight +
      STRIP_ABOVE_PANEL;
    if (this.panelOpen.value && strip < room) {
      void import("../Workspace").then(({ Workspace }) =>
        Workspace.window.setStripHeight(room),
      );
    }
  }

  collapsePanel() {
    if (this.panelOpen.value) {
      this.rememberPanelHeight(
        workspaceSettings.projectSettings.value.previewPanelHeight,
      );
      workspaceSettings.setProjectSetting("previewPanelHeight", PANEL_BAR_HEIGHT);
    }
  }

  togglePanel(returnFocus?: () => HTMLElement | null) {
    if (layoutState.current() === "phone") {
      this.openDialog({ kind: "story" }, returnFocus);
    } else if (this.problemsShown.value) {
      this.collapsePanel();
    } else {
      this.openPanel();
      this.revealCard(
        this.counts.value.problems || !this.played.value.length
          ? "script"
          : "played",
      );
    }
  }

  showProblems(
    returnFocus?: () => HTMLElement | null,
    path?: string,
  ) {
    if (!this.openPanel("script")) {
      this.openDialog(path ? { kind: "script", path } : { kind: "story" }, returnFocus);
    }
  }

  async jump(target: {
    uri?: string;
    path?: string;
    line: number;
    character?: number;
  }) {
    this.closeDialog();
    const { Workspace } = await import("../Workspace");
    const uri =
      target.uri ??
      (target.path ? Workspace.fs.getUriFromPath(target.path) : undefined);
    if (!uri) {
      return;
    }
    const at = {
      line: Math.max(0, target.line - 1),
      character: target.character ?? 0,
    };
    await Workspace.window.revealDocument(uri, { start: at, end: at });
  }

  async applyFix(choice: FixChoice) {
    const { Workspace } = await import("../Workspace");
    return applyFix(
      {
        getFileText: (uri) => Workspace.fs.getFileText(uri),
        offeredFixes: async (uri) => {
          const pulled = await Workspace.ls.pullDiagnostics(uri);
          if (!pulled) {
            return null;
          }
          this.record({ uri, ...pulled });
          return pulled.diagnostics.flatMap((d) => fixActionsOf(d.data));
        },
        applyWorkspaceEdit: (edit, label, metadata) =>
          Workspace.fs.applyWorkspaceEdit(edit, label, metadata),
        recordScriptChange: () => Workspace.window.recordScriptChange(),
        refreshDiagnostics: async (uri) => {
          const pulled = await Workspace.ls.pullDiagnostics(uri);
          if (pulled) {
            this.record({ uri, ...pulled });
          }
        },
      },
      choice,
    );
  }

  async goBackToChoice(checkpoint: number) {
    this.closeDialog();
    const { Workspace } = await import("../Workspace");
    return Workspace.window.goBackToChoice(checkpoint);
  }

  openDialog(scope: ProblemsScope, returnFocus?: () => HTMLElement | null) {
    this.dialog.value = { scope, returnFocus };
  }

  closeDialog() {
    this.dialog.value = null;
  }

  addPlayedSource(source: PlayedSource) {
    this._playedSources.add(source);
    return () => {
      this._playedSources.delete(source);
    };
  }

  addRunSource(source: RunSource) {
    this._runSources.add(source);
    return () => {
      this._runSources.delete(source);
    };
  }

  addPanelSource(source: PanelSource) {
    this._panelSources.add(source);
    return () => {
      this._panelSources.delete(source);
    };
  }

  receive(message: unknown) {
    if (ChoseEditorFixMessage.type.isNotification(message)) {
      void this.applyFix(message.params);
      return;
    }
    if (
      RequestedEditorToolMessage.type.isNotification(message) &&
      message.params.tool === "problems"
    ) {
      this.showProblems();
      return;
    }
    for (const source of this._runSources) {
      if (source(message)) {
        this.run.value += 1;
      }
    }
    for (const source of this._playedSources) {
      const entry = source(message);
      if (entry) {
        this.recordPlayed(entry);
      }
    }
    for (const source of this._panelSources) {
      const open = source(message);
      if (open === true) {
        this.openPanel("played");
      } else if (open === false) {
        this.collapsePanel();
      }
    }
  }

  protected revealCard(card: PanelCard) {
    this.reveal.value = { card, serial: ++this._serial };
  }
}

const problems = new ProblemsStore();

export default problems;
