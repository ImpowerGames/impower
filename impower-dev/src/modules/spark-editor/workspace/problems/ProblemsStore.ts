import { layoutState } from "@impower/impower-ui/layout";
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
import {
  CONSOLE_SEVERITIES,
  formatConsoleLog,
  PLAYED_LIMIT,
  plural,
  toProblems,
  type ConsoleEntry,
  type ConsoleSeverity,
  type PanelCard,
  type PlayedEntry,
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

export type PlayedSource = (message: unknown) => ConsoleEntry | null;

export type PanelSource = (message: unknown) => boolean | null;

export type PreviewPanel = "problems" | "route";

const CARD_SETTING = {
  script: "problemsScriptCardOpen",
  played: "problemsPlayedCardOpen",
} as const;

export class ProblemsStore {
  readonly diagnostics = signal<
    Readonly<Record<string, readonly Diagnostic[]>>
  >({});

  readonly played = signal<readonly PlayedEntry[]>([]);

  readonly shown = signal<Readonly<Record<ConsoleSeverity, boolean>>>({
    error: true,
    warning: true,
    info: true,
  });

  readonly dialog = signal<ProblemsDialogState | null>(null);

  readonly reveal = signal<{ card: PanelCard; serial: number } | null>(null);

  readonly problems = computed(() => toProblems(this.diagnostics.value));

  readonly visiblePlayed = computed(() =>
    this.played.value.filter((entry) => this.shown.value[entry.severity]),
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

  readonly cards = computed<Readonly<Record<PanelCard, boolean>>>(() => {
    const settings = workspaceSettings.projectSettings.value;
    return {
      script: settings[CARD_SETTING.script],
      played: settings[CARD_SETTING.played],
    };
  });

  protected _serial = 0;

  protected _openHeight = PANEL_OPEN_HEIGHT;

  protected readonly _playedSources = new Set<PlayedSource>();

  protected readonly _panelSources = new Set<PanelSource>();

  record({
    uri,
    diagnostics,
  }: {
    uri: string;
    diagnostics: readonly Diagnostic[];
  }) {
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

  recordPlayed(entry: ConsoleEntry, time = Date.now()) {
    const next = [...this.played.value, { ...entry, id: ++this._serial, time }];
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

  setCardOpen(card: PanelCard, open: boolean) {
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

  addPanelSource(source: PanelSource) {
    this._panelSources.add(source);
    return () => {
      this._panelSources.delete(source);
    };
  }

  receive(message: unknown) {
    if (
      RequestedEditorToolMessage.type.isNotification(message) &&
      message.params.tool === "problems"
    ) {
      this.showProblems();
      return;
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
