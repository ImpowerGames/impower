import {
  colorValueOf,
  lspColorOf,
  storyColors,
} from "@impower/codemirror-vscode-lsp-client/src/colorValue";
import {
  insertContext,
  sceneSpansOf,
  type InsertConstruct,
  type InsertContext,
} from "@impower/codemirror-vscode-lsp-client/src/insert";
import { layoutState, type Layout } from "@impower/impower-ui/layout";
import { ApplyEditorColorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorColorMessage";
import {
  onProtocolMessage,
  onProtocolRequest,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  ChangedEditorBreakpointsMessage,
  ChangedEditorBreakpointsMethod,
  ChangedEditorBreakpointsParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorBreakpointsMessage";
import { ChangedEditorHighlightsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorHighlightsMessage";
import { ChangedEditorHistoryMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorHistoryMessage";
import { ChangedEditorPinpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorPinpointsMessage";
import {
  ScrolledEditorMessage,
  ScrolledEditorMethod,
  ScrolledEditorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import {
  EditorCommand,
  ExecuteEditorCommandMessage,
} from "@impower/spark-editor-protocol/src/protocols/editor/ExecuteEditorCommandMessage";
import { ReadEditorKeybindingsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ReadEditorKeybindingsMessage";
import { InsertEditorConstructMessage } from "@impower/spark-editor-protocol/src/protocols/editor/InsertEditorConstructMessage";
import { ReadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ReadEditorMessage";
import type { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import type { ResponseMessage } from "@impower/spark-editor-protocol/src/types/base/ResponseMessage";
import { SelectEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectEditorMessage";
import {
  SelectedEditorMessage,
  SelectedEditorMethod,
  SelectedEditorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { HideEditorHoverValuesMessage } from "@impower/spark-editor-protocol/src/protocols/editor/HideEditorHoverValuesMessage";
import { EvaluateEditorHoverMessage } from "@impower/spark-editor-protocol/src/protocols/editor/EvaluateEditorHoverMessage";
import {
  type EditorBreakpoint,
  SetEditorBreakpointsMessage,
} from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorBreakpointsMessage";
import { SetEditorHighlightsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorHighlightsMessage";
import { SetEditorPinpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorPinpointsMessage";
import { SetEditorStartingValueLinesMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorStartingValueLinesMessage";
import { ChangedEditorStartingValueLinesMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorStartingValueLinesMessage";
import { SetStartingValuesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetStartingValuesMessage";
import {
  changeStartingValues,
  movePlaceLines,
  placeLinesOf,
  readPlaceKey,
  startingValuesFrom,
  type StartingValues,
} from "@impower/sparkdown/src/program/startingValueLiterals";
import { ChangedEditorRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorRoutePinsMessage";
import { SetEditorRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorRoutePinsMessage";
import {
  SetRoutePinsMessage,
  type RoutePin,
} from "@impower/spark-editor-protocol/src/protocols/preview/SetRoutePinsMessage";
import type { ChangeRoutePinsParams } from "@impower/spark-editor-protocol/src/protocols/preview/ChangeRoutePinsMessage";
import { changedRoutePins } from "@impower/spark-editor-protocol/src/utils/changedRoutePins";
import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { ShowDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/window/ShowDocumentMessage";
import { LoadedProjectIdMessage } from "@impower/spark-editor-protocol/src/protocols/window/LoadedProjectIdMessage";
import { DidOpenFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenFileEditorMessage";
import { ApplyWorkspaceEditMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";
import {
  Color,
  ColorInformation,
  EditorState,
  GamePosition,
  GameSize,
  GameState,
  ListsState,
  PaneType,
  PanelType,
  Range,
  SyncStatus,
  WorkspaceCache,
  WritingToolsView,
} from "@impower/spark-editor-protocol/src/types";
import { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import { ContinueGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/ContinueGameMessage";
import { RestartGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/RestartGameMessage";
import { StartGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StartGameMessage";
import { StopGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StopGameMessage";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { playRefusalOf } from "@impower/sparkdown/src/compiler/utils/startScene";
import {
  type DocumentSymbol,
  type ShowDocumentResult,
} from "vscode-languageserver-protocol";
import { debounce } from "../utils/debounce";
import { isScriptExtension } from "../utils/scriptFiles";
import SingletonPromise from "./SingletonPromise";
import WorkspaceDebugClient from "./WorkspaceDebugClient";
import {
  skipRefusal,
  stepRefusals,
  type SkipDirection,
  type StepTraversal,
} from "./stepStates";
import type { RollDebugTarget } from "@impower/spark-editor-protocol/src/protocols/debug/RollDebugRequest";
import type { SettledBeat } from "@impower/spark-engine/src/game/core/types/RunHistory";
import {
  checkName,
  joinScriptPath,
  type NameCheck,
  splitScriptPath,
} from "../utils/nameRules";
import { showSnackbar } from "../utils/snackbar";
import { downloadProjectZip } from "../utils/downloadProjectZip";
import {
  installOfferOf,
  keepOnDevice,
  recordBackup,
  recordChange,
  remindBackupIfDue,
  settleStorage,
  type InstallPromptEvent,
  type ProjectBackupRecord,
  type StorageProbe,
} from "../utils/storagePersistence";
import { DEVICE_STORAGE_COPY } from "./saveStatus";
import { WorkspaceConstants } from "./WorkspaceConstants";
import type WorkspaceFileSystem from "./WorkspaceFileSystem";
import type WorkspaceLanguageServer from "./WorkspaceLanguageServer";

type WorkspaceLanguageServerAccess = PreviewBeatSkipperDeps["ls"] &
  Partial<Pick<WorkspaceLanguageServer, "initialization" | "connection" | "getProgram">>;
import {
  definitionOf,
  isCue,
  isScriptUri,
  kindOfDefinition,
  lineOf,
  nameRangeAt,
  textOf,
  type HighlightLike,
  type NameAtCaret,
} from "./nameAtCaret";
import workspace, {
  cacheableWorkspaceState,
  loadedProjectId,
} from "./WorkspaceStore";
import type WorkspaceSync from "./WorkspaceSync";
import type { AccountInfo } from "./types/AccountInfo";
import { RemoteStorage } from "./types/RemoteStorageTypes";
import createTextFile from "./utils/createTextFile";
import createZipFile from "./utils/createZipFile";
import { PreviewSaveStore } from "@impower/spark-editor-protocol/src/utils/PreviewSaveStore";
import { opfsSaveFiles } from "./opfsSaveFiles";
import { countProjectFiles } from "./replaceProject";
import {
  loadExtensionDefaults,
  projectSettingsFromJson,
  projectSettingsJson,
} from "./settings/settingsJson";
import workspaceSettings from "./settings/WorkspaceSettings";
import type { PreviewMode } from "./settings/settingsSchema";
import {
  createPreviewBeatSkipper,
  type PreviewBeatSkipperDeps,
} from "./previewBeatSkipper";
import {
  hashOfRoute,
  hashNamesRoute,
  routeOfHash,
  routeOfState,
  stateForRoute,
  transitionRoute,
  type Route,
} from "./routes";
import type { PreviewSave } from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import { renameOrReport } from "../utils/renameOrReport";

export default class WorkspaceWindow {
  protected _loadProjectRef = new SingletonPromise(
    this._loadProject.bind(this),
  );

  protected _disposers: (() => void)[] = [];

  protected _workspace: {
    fs: WorkspaceFileSystem;
    sync: WorkspaceSync;
    ls?: WorkspaceLanguageServerAccess;
  };

  protected _skipBeat?: (direction: -1 | 1) => Promise<boolean>;

  readonly debug = new WorkspaceDebugClient({
    onStop: (position) => this.followStop(position),
    onRoll: (restored) => this.followRoll(restored),
    onRefusal: (message) => showSnackbar({ message }),
    saveWatch: (expressions) => this.setWatchExpressions(expressions),
    source: (uri) => this.scriptSource(uri),
  });

  constructor(workspace: {
    fs: WorkspaceFileSystem;
    sync: WorkspaceSync;
    ls?: WorkspaceLanguageServerAccess;
  }) {
    this._workspace = workspace;
    this.cacheProjectId(loadedProjectId());
    this.registerProtocolHandlers();
    this.handleLayoutChange(layoutState.current());
    this._disposers.push(layoutState.subscribe(this.handleLayoutChange));
    this.connectRoutes();
  }

  protected _routesConnected = false;

  protected _route?: Route;

  protected connectRoutes() {
    if (typeof window === "undefined") {
      return;
    }
    const onHashChange = () => {
      const route = routeOfHash(window.location.hash);
      if (!route) {
        this.syncRouteHash();
        return;
      }
      if (route !== routeOfState(this.store)) {
        transitionRoute(() => this.openRoute(route));
      }
    };
    const initial = routeOfHash(window.location.hash);
    if (initial && initial !== routeOfState(this.store)) {
      this.update(stateForRoute(this.store, initial));
    }
    this._routesConnected = true;
    this.syncRouteHash();
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    this._disposers.push(() => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
      this._routesConnected = false;
      this._route = undefined;
    });
  }

  protected syncRouteHash() {
    if (!this._routesConnected) {
      return;
    }
    const route = routeOfState(this.store);
    const hash = hashOfRoute(route);
    if (route === this._route && routeOfHash(window.location.hash)) {
      return;
    }
    this._route = route;
    if (!hashNamesRoute(window.location.hash, route)) {
      window.history.replaceState(window.history.state, "", hash);
    }
  }

  openRoute(route: Route) {
    this.update(stateForRoute(this.store, route));
  }

  navigateTo(route: Route, section?: string) {
    if (typeof window === "undefined") {
      this.openRoute(route);
      return;
    }
    const hash = hashOfRoute(route, section);
    if (window.location.hash !== hash) {
      window.history.pushState(window.history.state, "", hash);
      if (section && routeOfState(this.store) === route) {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }
    }
    transitionRoute(() => this.openRoute(route));
  }

  setListState(lists: Partial<ListsState>) {
    this.update({
      ...this.store,
      lists: { ...this.store.lists, ...lists },
    });
  }

  browseScripts() {
    this.navigateTo("scripts");
  }

  openScript(filename: string) {
    const panel = this.getPanelType(filename);
    if (!panel) {
      return;
    }
    this.openPanel("logic", panel);
    this.openFileEditor(filename);
    this.navigateTo("write");
  }

  closeSettings() {
    if (!this.store.screen.settingsOpen) {
      return;
    }
    this.update({
      ...this.store,
      screen: { ...this.store.screen, settingsOpen: false },
    });
  }

  openChangeColor(filename: string, range: Range, value: string, color: Color) {
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
        appMenuOpen: false,
        writingTools: {
          view: "color",
          fromMenu: true,
          color: { filename, range, value, color },
        },
      },
    });
  }

  async applyChangeColor(
    value: string,
  ): Promise<"applied" | "invalid" | "moved" | "locked"> {
    const target = this.store.screen.writingTools?.color;
    const projectId = this.store.project.id;
    const color = colorValueOf(value);
    if (!color) {
      return "invalid";
    }
    if (!target || !projectId) {
      return "moved";
    }
    const uri = this._workspace.fs.getFileUri(projectId, target.filename);
    const result = await this.requestEditor(ApplyEditorColorMessage.type, {
      textDocument: { uri },
      range: target.range,
      text: target.value,
      color: lspColorOf(color),
    });
    if (!result?.applied) {
      return result?.readOnly ? "locked" : "moved";
    }
    if (this.store.screen.writingTools?.color === target) {
      this.closeWritingTools();
    }
    return "applied";
  }

  async readStoryColors(): Promise<string[]> {
    const ls = this._workspace.ls;
    const connection = ls?.connection;
    if (!connection || !ls.getProgram) {
      return [];
    }
    const program = await ls.getProgram().catch((error: unknown) => {
      console.error("Story colors: no program to read scripts from", error);
      return null;
    });
    const uris = Object.keys(program?.scripts ?? {});
    const documents = await Promise.all(
      uris.map(async (uri) => {
        const infos = await connection
          .sendRequest<ColorInformation[] | null>(
            "textDocument/documentColor",
            { textDocument: { uri } },
          )
          .catch((error: unknown) => {
            console.error(`Story colors: documentColor failed for ${uri}`, error);
            return null;
          });
        return [...(infos ?? [])]
          .sort(
            (a, b) =>
              a.range.start.line - b.range.start.line ||
              a.range.start.character - b.range.start.character,
          )
          .map((info) => info.color);
      }),
    );
    return storyColors(documents);
  }

  setAppMenuOpen(open: boolean) {
    if (!!this.store.screen.appMenuOpen === open) {
      return;
    }
    this.update({
      ...this.store,
      screen: { ...this.store.screen, appMenuOpen: open },
    });
  }

  openWritingTools(view: WritingToolsView = "menu") {
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
        appMenuOpen: false,
        addPanel: undefined,
        writingTools: { view, fromMenu: false },
      },
    });
  }

  showWritingToolsView(view: WritingToolsView) {
    if (!this.store.screen.writingTools) {
      return;
    }
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
        writingTools: { view, fromMenu: view !== "menu" },
      },
    });
  }

  closeWritingTools() {
    if (!this.store.screen.writingTools) {
      return;
    }
    this.update({
      ...this.store,
      screen: { ...this.store.screen, writingTools: undefined },
    });
  }

  openAddPanel() {
    if (workspace.effectiveScriptMode.peek() === "reading") {
      workspace.scriptMode.value = "editing";
    }
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
        appMenuOpen: false,
        writingTools: undefined,
        addPanel: true,
      },
    });
  }

  closeAddPanel() {
    if (!this.store.screen.addPanel) {
      return;
    }
    this.update({
      ...this.store,
      screen: { ...this.store.screen, addPanel: undefined },
    });
  }

  async readInsertContext(filename: string): Promise<InsertContext | null> {
    const projectId = this.store.project.id;
    const ls = this._workspace.ls;
    if (!projectId || !ls?.initialization || !ls.connection) {
      return null;
    }
    const uri = this._workspace.fs.getFileUri(projectId, filename);
    const editor = await this.requestEditor(ReadEditorMessage.type, {
      textDocument: { uri },
    });
    if (!editor) {
      return null;
    }
    await ls.initialization();
    const symbols = await ls.connection
      .sendRequest<DocumentSymbol[] | null>("textDocument/documentSymbol", {
        textDocument: { uri },
      })
      .catch(() => undefined);
    if (symbols === undefined) {
      return null;
    }
    const { text } = editor.textDocument;
    const { line, character } = editor.caret;
    const offset = text
      .split("\n")
      .slice(0, line)
      .reduce((total, row) => total + row.length + 1, character);
    return insertContext(text, offset, sceneSpansOf(symbols));
  }

  async insertConstruct(
    filename: string,
    construct: InsertConstruct,
  ): Promise<boolean> {
    this.closeAddPanel();
    const projectId = this.store.project.id;
    if (!projectId) {
      return false;
    }
    const uri = this._workspace.fs.getFileUri(projectId, filename);
    const result = await this.requestEditor(InsertEditorConstructMessage.type, {
      textDocument: { uri },
      construct,
    });
    if (!result?.inserted) {
      showSnackbar({
        message: "Couldn't add that here. Move to another line and try again.",
      });
    }
    return !!result?.inserted;
  }

  startEditing(filename: string) {
    workspace.scriptMode.value = "editing";
    this.executeEditorCommand(filename, "focus");
  }

  finishEditing() {
    if (workspace.scriptMode.peek() !== "editing") {
      return;
    }
    workspace.scriptMode.value = "reading";
  }

  openSparkdownGuide() {
    if (this._route !== "write") {
      this.navigateTo("write");
    }
    this.openWritingTools("guide");
  }

  setRailWidth(width: number | undefined) {
    this.update({
      ...this.store,
      shell: { ...this.store.shell, railWidth: width },
    });
  }

  setOutlineSceneCollapsed(uri: string, scene: string, collapsed: boolean) {
    const current = this.store.outline?.collapsed?.[uri] ?? [];
    if (current.includes(scene) === collapsed) {
      return;
    }
    const scenes = collapsed
      ? [...current, scene]
      : current.filter((key) => key !== scene);
    const { [uri]: _previous, ...others } = this.store.outline?.collapsed ?? {};
    this.update({
      ...this.store,
      outline: {
        ...this.store.outline,
        collapsed: scenes.length ? { ...others, [uri]: scenes } : others,
      },
    });
  }

  async openOutlineLocation(uri: string, range: Range) {
    if (this.store.pane !== "logic" || this.store.screen.settingsOpen) {
      this.navigateTo("write");
    }
    await this.showDocument(uri, range, true, true);
  }

  setRailCompactWidth(width: number | undefined) {
    this.update({
      ...this.store,
      shell: { ...this.store.shell, railCompactWidth: width },
    });
  }

  setStripHeight(height: number | undefined) {
    this.update({
      ...this.store,
      shell: { ...this.store.shell, stripHeight: height },
    });
  }

  async signInToGoogleDrive() {
    try {
      const info = await this._workspace.sync.google.signIn();
      this.setAccount(info);
    } catch (err) {
      console.error(err);
      this.clearAccount();
    }
  }

  async signOutOfGoogleDrive() {
    try {
      this.unloadProject();
      await this._workspace.sync.google.signOut();
      this.loadNewProject(WorkspaceConstants.LOCAL_PROJECT_ID);
      this.clearAccount();
    } catch (err) {
      console.error(err);
    }
  }

  async openProjectFromDrive() {
    try {
      const provider = this._workspace.sync.google;
      const token = (await provider.getAccess())?.token;
      if (!token) {
        return;
      }
      this.startPickingRemoteProjectResource();
      try {
        const fileId = await provider.pickRemoteProjectFile(token);
        if (fileId) {
          this.unloadProject();
          this.loadNewProject(fileId);
        }
      } finally {
        this.finishPickingRemoteProjectResource();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async saveProjectToDrive() {
    try {
      if (!this.store.project.id) {
        return;
      }
      const provider = this._workspace.sync.google;
      const token = (await provider.getAccess())?.token;
      if (!token) {
        return;
      }
      this.startPickingRemoteProjectResource();
      try {
        const folderId = await provider.pickRemoteProjectFolder(token);
        if (folderId) {
          await this.saveRemoteProject(folderId);
        }
      } finally {
        this.finishPickingRemoteProjectResource();
      }
    } catch (err) {
      console.error(err);
    }
  }

  protected _installPrompt: InstallPromptEvent | null = null;

  protected _storageReview: Promise<void> = Promise.resolve();

  protected _backupStartedAt: number | null = null;

  reviewDeviceStorage() {
    this._storageReview = this._storageReview
      .then(() => this.reviewStorageNow())
      .catch((err) => console.error(err));
    return this._storageReview;
  }

  protected async reviewStorageNow() {
    await this.refreshDeviceStorage();
    const id = this.store.project.id;
    if (!id) {
      return;
    }
    try {
      await remindBackupIfDue({
        local: id === WorkspaceConstants.LOCAL_PROJECT_ID,
        persisted: workspace.deviceStorage.peek()?.persisted ?? false,
        project: this.backupRecord(id),
        now: Date.now(),
        exportProject: downloadProjectZip,
      });
    } catch (err) {
      console.error(err);
    }
  }

  async refreshDeviceStorage() {
    this.setDeviceStorage(
      await settleStorage(navigator.storage, navigator.permissions),
    );
  }

  async keepProjectOnDevice() {
    const probe = await keepOnDevice(navigator.storage, navigator.permissions);
    this.setDeviceStorage(probe);
    if (!probe.persisted) {
      showSnackbar({ message: DEVICE_STORAGE_COPY.keepRefused });
    }
  }

  offerAppInstall(prompt: InstallPromptEvent | null) {
    this._installPrompt = prompt;
    const current = workspace.deviceStorage.peek();
    if (current) {
      this.setDeviceStorage(current);
    }
  }

  async installApp() {
    const prompt = this._installPrompt;
    if (!prompt) {
      return;
    }
    this.offerAppInstall(null);
    try {
      await prompt.prompt();
    } catch (err) {
      console.error(err);
    }
  }

  async recordProjectChange(id: string) {
    try {
      await recordChange(
        this.backupRecord(id),
        Date.now(),
        this._backupStartedAt,
      );
    } catch (err) {
      console.error(err);
    }
  }

  async backUpProject<T>(
    backUp: () => Promise<T>,
    id = this.store.project.id,
  ): Promise<T> {
    const startedAt = Date.now();
    this._backupStartedAt = startedAt;
    try {
      const backedUp = await backUp();
      if (backedUp && id) {
        await recordBackup(this.backupRecord(id), startedAt).catch((err) =>
          console.error(err),
        );
      }
      return backedUp;
    } finally {
      if (this._backupStartedAt === startedAt) {
        this._backupStartedAt = null;
      }
    }
  }

  protected setDeviceStorage(probe: StorageProbe) {
    const standalone = (navigator as { standalone?: boolean }).standalone;
    workspace.deviceStorage.value = {
      ...probe,
      install: installOfferOf({
        installed:
          standalone === true ||
          window.matchMedia("(display-mode: standalone)").matches,
        promptReady: this._installPrompt !== null,
        homeScreen: standalone === false,
      }),
    };
  }

  protected backupRecord(id: string): ProjectBackupRecord {
    const fs = this._workspace.fs;
    return {
      read: (field) => fs.readProjectMetadata(id, field),
      write: (field, value) => fs.writeProjectMetadata(id, field, value),
    };
  }

  openSyncConflict() {
    if (this.store.sync.status === "sync_conflict") {
      workspace.syncConflictOpen.value = true;
    }
  }

  closeSyncConflict() {
    workspace.syncConflictOpen.value = false;
  }

  openTrash() {
    workspace.trashOpen.value = true;
  }

  async resolveSyncConflict(keep: "device" | "drive") {
    this.closeSyncConflict();
    if (keep === "device") {
      await this.resolveConflictWithPush();
    } else {
      await this.resolveConflictWithPull();
    }
  }

  protected _replacementFile?: File;

  async requestProjectReplace(file: File) {
    const projectId = this.store.project.id;
    if (!projectId) {
      return;
    }
    const fs = this._workspace.fs;
    const files = await fs.getFiles(projectId);
    this._replacementFile = file;
    workspace.replaceProject.value = {
      fileName: file.name,
      projectName: this.store.project.name || "this project",
      ...countProjectFiles(
        Object.keys(files).map((uri) => fs.getRelativePath(projectId, uri)),
      ),
    };
  }

  cancelProjectReplace() {
    this._replacementFile = undefined;
    workspace.replaceProject.value = null;
  }

  async confirmProjectReplace() {
    const file = this._replacementFile;
    this.cancelProjectReplace();
    if (file) {
      await this.importLocalProject(file.name, await file.arrayBuffer());
    }
  }

  dispose() {
    this._disposers.forEach((dispose) => dispose());
    this._disposers = [];
    this.debug.end();
    this.cacheProjectWorkspace.flush();
  }

  protected registerProtocolHandlers() {
    this._disposers.push(
      onProtocolRequest(LoadedProjectIdMessage.type, (m) =>
        LoadedProjectIdMessage.type.response(m.id, {
          id: this._workspace.fs.getLoadedProjectId(),
        }),
      ),
      onProtocolMessage(DidOpenFileEditorMessage.type, (m) =>
        this.openFileEditor(m.params.filename),
      ),
      onProtocolRequest(ShowDocumentMessage.type, (m) =>
        this.handleShowDocument(m),
      ),
      onProtocolRequest(ApplyWorkspaceEditMessage.type, (m) =>
        this.handleApplyWorkspaceEdit(m),
      ),
      onProtocolMessage(ScrolledEditorMessage.type, (m) =>
        this.handleScrolledEditor(m),
      ),
      onProtocolMessage(SelectedEditorMessage.type, (m) =>
        this.handleSelectedEditor(m),
      ),
      onProtocolMessage(ChangedEditorBreakpointsMessage.type, (m) =>
        this.handleChangedEditorBreakpoints(m),
      ),
      onProtocolRequest(EvaluateEditorHoverMessage.type, async (m) =>
        EvaluateEditorHoverMessage.type.response(m.id, {
          value: await this.debug.evaluate(m.params.expression),
        }),
      ),
      this.followVerifiedBreakpoints(),
      this.followStopEnds(),
      onProtocolMessage(ChangedEditorPinpointsMessage.type, (m) =>
        this.handleChangedEditorPinpoints(m),
      ),
      onProtocolMessage(ChangedEditorRoutePinsMessage.type, (m) =>
        this.handleChangedEditorRoutePins(m),
      ),
      onProtocolMessage(ChangedEditorHighlightsMessage.type, (m) =>
        this.handleChangedEditorHighlights(m),
      ),
      onProtocolMessage(ChangedEditorHistoryMessage.type, (m) =>
        this.handleChangedEditorHistory(m),
      ),
      onProtocolMessage(ChangedEditorStartingValueLinesMessage.type, (m) =>
        this.handleChangedEditorStartingValueLines(m),
      ),
      onProtocolMessage(CompiledProgramMessage.type, (m) =>
        this.handleCompiledProgram(m),
      ),
      onProtocolMessage(
        {
          is: (m: unknown): m is StartGameMessage.Response =>
            this._startGameRequestId !== undefined &&
            StartGameMessage.type.isResponse(m, this._startGameRequestId),
        },
        (m) => this.handleStartGameResponse(m),
      ),
    );
  }

  protected _startGameRequestId?: string | number;

  protected handleStartGameResponse = (message: StartGameMessage.Response) => {
    this._startGameRequestId = undefined;
    if ("error" in message && message.error) {
      this.endGame();
    }
  };

  get store() {
    return workspace.current;
  }

  protected cacheProjectWorkspace = debounce((store: WorkspaceCache) => {
    localStorage.setItem(
      WorkspaceConstants.WORKSPACE_STATE_STORAGE_KEY_PREFIX + store.project.id,
      JSON.stringify(cacheableWorkspaceState(store)),
    );
  }, 300);

  protected update(store: WorkspaceCache) {
    workspace.current = store;
    this.cacheProjectWorkspace(store);
    this.syncRouteHash();
  }

  protected cacheProjectId(id: string) {
    this.update({
      ...this.store,
      project: { ...this.store.project, id },
    });
    localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, id);
  }

  setAccount(info: AccountInfo | null) {
    workspace.account.value = info ?? null;
  }

  clearAccount() {
    workspace.account.value = null;
  }

  protected handleShowDocument = async (
    message: ShowDocumentMessage.Request,
  ) => {
    const { uri, selection, takeFocus } = message.params;
    const result = await this.revealDocument(uri, selection, takeFocus ?? true);
    return ShowDocumentMessage.type.response(message.id, result);
  };

  protected handleApplyWorkspaceEdit = async (
    message: ApplyWorkspaceEditMessage.Request,
  ) => {
    const { label, edit, metadata } = message.params;
    const result = await this._workspace.fs.applyWorkspaceEdit(
      edit,
      label,
      metadata,
    );
    return ApplyWorkspaceEditMessage.type.response(message.id, result);
  };

  protected handleScrolledEditor = (
    message: NotificationMessage<ScrolledEditorMethod, ScrolledEditorParams>,
  ) => {
    const { textDocument, visibleRange } = message.params;
    const uri = textDocument.uri;
    const filename = this.relativePathOf(uri);
    const pane = this.getPaneType(filename);
    const panel = this.getPanelType(filename);
    if (pane && panel) {
      this.update({
        ...this.store,
        panes: {
          ...this.store.panes,
          [pane]: {
            ...this.store.panes[pane],
            panels: {
              ...this.store.panes[pane].panels,
              [panel]: {
                ...this.store.panes[pane].panels[panel],
                activeEditor: {
                  ...this.store.panes[pane].panels[panel]!.activeEditor,
                  visibleRange,
                },
              },
            },
          },
        },
      });
    }
  };

  protected handleSelectedEditor = (
    message: NotificationMessage<SelectedEditorMethod, SelectedEditorParams>,
  ) => {
    const { textDocument, selectedRange, hasFocus } = message.params;
    const uri = textDocument.uri;
    const filename = this.relativePathOf(uri);
    const pane = this.getPaneType(filename);
    const panel = this.getPanelType(filename);
    if (pane && panel) {
      this.update({
        ...this.store,
        panes: {
          ...this.store.panes,
          [pane]: {
            ...this.store.panes[pane],
            panels: {
              ...this.store.panes[pane].panels,
              [panel]: {
                ...this.store.panes[pane].panels[panel],
                activeEditor: {
                  ...this.store.panes[pane].panels[panel]!.activeEditor,
                  focused: hasFocus,
                  selectedRange,
                },
              },
            },
          },
        },
      });
    }
  };

  protected handleChangedEditorBreakpoints = (
    message: NotificationMessage<
      ChangedEditorBreakpointsMethod,
      ChangedEditorBreakpointsParams
    >,
  ) => {
    const { textDocument, breakpointLines } = message.params;
    const uri = textDocument.uri;
    this.setBreakpointLines(uri, breakpointLines);
    void this.debug.setBreakpoints(uri, breakpointLines);
  };

  protected setBreakpointLines(uri: string, lines: number[]) {
    this.update({
      ...this.store,
      debug: {
        ...this.store.debug,
        breakpoints: {
          ...this.store.debug.breakpoints,
          [uri]: lines,
        },
      },
    });
  }

  setWatchExpressions(expressions: readonly string[]) {
    this.update({
      ...this.store,
      debug: { ...this.store.debug, watch: [...expressions] },
    });
  }

  protected scriptSource(uri: string) {
    const fs = this._workspace.fs;
    const root = `${fs.getDirectoryUri(this.store.project.id ?? "")}/`;
    return uri.startsWith(root)
      ? { path: uri.slice(root.length), inProject: true }
      : { path: fs.getFilename(uri), inProject: false };
  }

  protected followVerifiedBreakpoints() {
    let followed = workspace.debugSession.peek().breakpoints;
    return workspace.debugSession.subscribe(({ breakpoints }) => {
      if (breakpoints === followed) {
        return;
      }
      const previous = followed;
      followed = breakpoints;
      for (const [uri, verified] of Object.entries(breakpoints)) {
        if (verified !== previous[uri]) {
          this.applyVerifiedBreakpoints(uri, verified);
        }
      }
    });
  }

  protected followStopEnds() {
    let stopped = workspace.debugSession.peek().stopped;
    return workspace.debugSession.subscribe((session) => {
      const ended = stopped != null && session.stopped !== stopped;
      stopped = session.stopped;
      if (ended) {
        sendProtocolMessage(HideEditorHoverValuesMessage.type.notification({}));
      }
    });
  }

  protected applyVerifiedBreakpoints(uri: string, verified: EditorBreakpoint[]) {
    const lines = [...new Set(verified.map((b) => b.line))].sort((a, b) => a - b);
    const states = lines.map((line): EditorBreakpoint => {
      if (verified.some((b) => b.line === line && b.verified)) {
        return { line, verified: true };
      }
      const message = verified.find((b) => b.line === line)?.message;
      return message == null ? { line, verified: false } : { line, verified: false, message };
    });
    this.setBreakpointLines(uri, lines);
    sendProtocolMessage(
      SetEditorBreakpointsMessage.type.request({
        textDocument: { uri },
        breakpoints: states,
      }),
    );
  }

  protected handleChangedEditorStartingValueLines = (
    message: ChangedEditorStartingValueLinesMessage.Notification,
  ) => {
    const { textDocument, moves } = message.params;
    const values = this.startingValues;
    const moved = movePlaceLines(values, textDocument.uri, new Map(moves));
    if (moved !== values) {
      this.setStartingValues(moved, false);
    }
  };

  protected handleChangedEditorPinpoints = (
    message: ChangedEditorPinpointsMessage.Notification,
  ) => {
    const { textDocument, pinpointLines } = message.params;
    const uri = textDocument.uri;
    this.update({
      ...this.store,
      debug: {
        ...this.store.debug,
        pinpoints: {
          ...this.store.debug.pinpoints,
          [uri]: pinpointLines,
        },
      },
    });
  };

  protected handleChangedEditorHighlights = (
    message: ChangedEditorHighlightsMessage.Notification,
  ) => {
    const { textDocument, highlightLines } = message.params;
    const uri = textDocument.uri;
    this.update({
      ...this.store,
      debug: {
        ...this.store.debug,
        highlights: {
          ...this.store.debug.highlights,
          [uri]: highlightLines,
        },
      },
    });
  };

  protected handleChangedEditorHistory(
    message: ChangedEditorHistoryMessage.Notification,
  ) {
    const { textDocument, canUndo, canRedo } = message.params;
    workspace.editorHistory.value = {
      ...workspace.editorHistory.peek(),
      [this.relativePathOf(textDocument.uri)]: { canUndo, canRedo },
    };
  }

  protected handleCompiledProgram = (
    message: CompiledProgramMessage.Notification,
  ) => {
    const { program } = message.params;
    const projectId = this.store.project.id;
    const game = this.store.preview.modes.game;
    const story =
      !!projectId &&
      program.uri === this._workspace.fs.getFileUri(projectId, "main.sd");
    if (story) {
      this.setStoryFrontMatter(program.frontMatter ?? {});
    }
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        modes: {
          ...this.store.preview.modes,
          game: {
            ...game,
            playRefusal: story ? playRefusalOf(program) : game.playRefusal,
          },
        },
      },
    });
  };
  protected handleLayoutChange = (layout: Layout) => {
    const horizontalLayout = layout !== "phone";
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
        horizontalLayout,
      },
    });
  };

  setHighlights(highlights: Record<string, number[]>) {
    this.update({
      ...this.store,
      debug: {
        ...this.store.debug,
        highlights,
      },
    });
    const locations = Object.entries(highlights).flatMap(([uri, lines]) =>
      lines.map((line) => ({
        uri,
        range: { start: { line, character: 0 }, end: { line, character: 0 } },
      })),
    );
    sendProtocolMessage(SetEditorHighlightsMessage.type.request({ locations }));
  }

  setPinpoints(pinpoints: Record<string, number[]>) {
    this.update({
      ...this.store,
      debug: {
        ...this.store.debug,
        pinpoints,
      },
    });
    const locations = Object.entries(pinpoints).flatMap(([uri, lines]) =>
      lines.map((line) => ({
        uri,
        range: { start: { line, character: 0 }, end: { line, character: 0 } },
      })),
    );
    sendProtocolMessage(SetEditorPinpointsMessage.type.request({ locations }));
  }

  protected _previewSaveStore = new PreviewSaveStore(opfsSaveFiles());

  protected previewSaveProject(): string {
    const id = this.store.project.id;
    if (!id) {
      throw new Error("No project is open to keep saves for.");
    }
    return id;
  }

  readonly previewSaves = {
    list: () => this._previewSaveStore.list(this.previewSaveProject()),
    write: (save: PreviewSave) =>
      this._previewSaveStore.write(this.previewSaveProject(), save),
    rename: (id: string, name: string) =>
      this._previewSaveStore.rename(this.previewSaveProject(), id, name),
    delete: (ids: readonly string[]) =>
      this._previewSaveStore.delete(this.previewSaveProject(), ids),
  };

  get startingValues(): StartingValues {
    return startingValuesFrom(this.store.debug.startingValues);
  }

  changeStartingValues(start: string, changes: Record<string, string | null>) {
    this.setStartingValues(
      changeStartingValues(this.startingValues, start, changes),
      true,
    );
  }

  protected setStartingValues(values: StartingValues, lines: boolean) {
    this.update({
      ...this.store,
      debug: {
        ...this.store.debug,
        startingValues: values,
      },
    });
    this.publishStartingValues(lines);
  }

  publishStartingValues(lines = true) {
    const values = this.startingValues;
    sendProtocolMessage(SetStartingValuesMessage.type.request({ values }));
    if (lines) {
      const uris = new Set<string>();
      for (const set of Object.values(values)) {
        for (const key of Object.keys(set)) {
          const place = readPlaceKey(key);
          if (place) {
            uris.add(place.uri);
          }
        }
      }
      const uri = this.getOpenedDocumentUri();
      if (uri) {
        uris.add(uri);
      }
      sendProtocolMessage(
        SetEditorStartingValueLinesMessage.type.request({
          scripts: [...uris].map((uri) => ({
            uri,
            lines: placeLinesOf(values, uri),
          })),
        }),
      );
    }
  }

  getRoutePins(): RoutePin[] {
    return Object.entries(this.store.debug.routePins ?? {}).flatMap(
      ([uri, pins]) => pins.map(({ line, offer }) => ({ uri, line, offer })),
    );
  }

  protected storeRoutePins(
    routePins: Record<string, { line: number; offer: number }[]>,
    fromPreview: boolean,
  ) {
    this.update({
      ...this.store,
      debug: { ...this.store.debug, routePins },
    });
    const pins = this.getRoutePins();
    if (fromPreview) {
      sendProtocolMessage(SetEditorRoutePinsMessage.type.request({ pins }));
    }
    sendProtocolMessage(SetRoutePinsMessage.type.request({ pins }));
  }

  changeRoutePins(change: ChangeRoutePinsParams): RoutePin[] {
    this.storeRoutePins(
      changedRoutePins(this.store.debug.routePins ?? {}, change),
      true,
    );
    return this.getRoutePins();
  }

  protected handleChangedEditorRoutePins = (
    message: ChangedEditorRoutePinsMessage.Notification,
  ) => {
    const { textDocument, pins } = message.params;
    const routePins = { ...this.store.debug.routePins };
    if (pins.length > 0) {
      routePins[textDocument.uri] = pins;
    } else {
      delete routePins[textDocument.uri];
    }
    this.storeRoutePins(routePins, false);
  };

  getPaneState(pane: PaneType) {
    const paneState = this.store.panes[pane];
    if (!paneState) {
      throw new Error(`Pane type not recognized: ${pane}`);
    }
    return paneState;
  }

  getPanelState(pane: PaneType, panel: PanelType) {
    const paneState = this.getPaneState(pane);
    const panelState = paneState.panels[panel];
    if (!panelState) {
      throw new Error(`Panel type not recognized: ${panel}`);
    }
    return panelState;
  }

  getOpenedPane() {
    return this.store.pane;
  }

  getOpenedPanel(pane: PaneType) {
    const paneState = this.getPaneState(pane);
    return paneState.panel;
  }

  getOpenedPanelState(pane: PaneType) {
    const panel = this.getOpenedPanel(pane);
    const panelState = this.getPanelState(pane, panel);
    return panelState;
  }

  getPaneType(filenameOrUri: string) {
    const ext = this.extOfBasename(filenameOrUri);
    if (isScriptExtension(ext)) {
      return "logic";
    }
    return null;
  }

  getPanelType(filenameOrUri: string) {
    if (this.relativePathOf(filenameOrUri) === "main.sd") {
      return "main";
    }
    if (isScriptExtension(this.extOfBasename(filenameOrUri))) {
      return "scripts";
    }
    return null;
  }

  private relativePathOf(filenameOrUri: string) {
    return filenameOrUri.includes("://")
      ? this._workspace.fs.getRelativePath(
          this.store.project.id ?? "",
          filenameOrUri,
        )
      : filenameOrUri;
  }

  private extOfBasename(filenameOrUri: string) {
    const base = filenameOrUri.split("/").pop() ?? "";
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(dot + 1) : "";
  }

  getActiveEditorForFile(filenameOrUri: string):
    | (EditorState & {
        uri: string;
        breakpointLines: number[] | undefined;
        pinpointLines: number[] | undefined;
        highlightLines: number[] | undefined;
        startingValueLines: number[];
        routePins: { line: number; offer: number }[] | undefined;
      })
    | undefined {
    const projectId = this.store.project.id;
    if (projectId) {
      const pane = this.getPaneType(filenameOrUri);
      const panel = this.getPanelType(filenameOrUri);
      if (pane && panel) {
        const panelState = this.getPanelState(pane, panel);
        if (
          panelState.activeEditor &&
          panelState.activeEditor.filename === filenameOrUri
        ) {
          const uri = this._workspace.fs.getFileUri(projectId, filenameOrUri);
          return {
            ...panelState.activeEditor,
            uri,
            breakpointLines: this.store.debug?.breakpoints?.[uri],
            pinpointLines: this.store.debug?.pinpoints?.[uri],
            highlightLines: this.store.debug?.highlights?.[uri],
            startingValueLines: placeLinesOf(this.startingValues, uri),
            routePins: this.store.debug?.routePins?.[uri],
          };
        }
      }
    }
    return undefined;
  }

  getActiveEditorForPane(pane: PaneType):
    | (EditorState & {
        projectId: string;
        uri: string;
        visibleRange:
          | Range
          | "nearest"
          | "start"
          | "end"
          | "center"
          | undefined;
        selectedRange: Range | undefined;
        breakpointLines: number[] | undefined;
        pinpointLines: number[] | undefined;
        startingValueLines: number[];
      })
    | undefined {
    const projectId = this.store.project.id;
    if (projectId) {
      const paneState = this.getPaneState(pane);
      const currentPanelState = paneState.panels[paneState.panel];
      const panelState = currentPanelState?.activeEditor?.open
        ? currentPanelState
        : Object.values(paneState.panels).find((p) => p.activeEditor?.open);
      const openEditor = panelState?.activeEditor;
      if (openEditor?.open && openEditor?.filename) {
        const uri = this._workspace.fs.getFileUri(
          projectId,
          openEditor.filename,
        );
        return {
          ...openEditor,
          projectId,
          uri,
          visibleRange: openEditor.visibleRange,
          selectedRange: openEditor.selectedRange,
          breakpointLines: this.store.debug?.breakpoints?.[uri],
          pinpointLines: this.store.debug?.pinpoints?.[uri],
          startingValueLines: placeLinesOf(this.startingValues, uri),
        };
      }
    }
    return undefined;
  }

  getOpenedDocumentUri() {
    const openPane = this.getOpenedPane();
    const activeEditor = this.getActiveEditorForPane(openPane);
    if (activeEditor) {
      const uri = activeEditor.uri;
      if (uri) {
        return uri;
      }
    }
    return undefined;
  }

  async showDocument(
    uri: string,
    range?: Range,
    takeFocus?: boolean,
    userEvent?: boolean,
  ): Promise<ShowDocumentResult> {
    const filename = this._workspace.fs.getRelativePath(
      this.store.project.id ?? "",
      uri,
    );
    const pane = this.getPaneType(filename);
    const panel = this.getPanelType(filename);
    if (!pane || !panel) {
      return { success: false };
    }
    const panels = this.store.panes[pane].panels;
    const scripts = (
      panels as Record<string, { activeEditor?: EditorState } | undefined>
    )["scripts"];
    const coveringEditor =
      panel === "main" && scripts?.activeEditor?.open
        ? {
            scripts: {
              ...scripts,
              activeEditor: { ...scripts.activeEditor, open: false },
            },
          }
        : {};
    this.update({
      ...this.store,
      panes: {
        ...this.store.panes,
        [pane]: {
          ...this.store.panes[pane],
          view: panel === "main" ? "list" : "logic-editor",
          panel: panel,
          panels: {
            ...panels,
            ...coveringEditor,
            [panel]: {
              ...this.store.panes[pane].panels[panel],
              activeEditor: {
                ...this.store.panes[pane].panels[panel]?.activeEditor,
                open: true,
                filename: filename,
                focused:
                  takeFocus ??
                  this.store.panes[pane].panels[panel]?.activeEditor?.focused,
                visibleRange: "center",
                selectedRange: range
                  ? { ...range }
                  : this.store.panes[pane].panels[panel]?.activeEditor
                        ?.filename === filename
                    ? this.store.panes[pane].panels[panel]?.activeEditor
                        ?.selectedRange
                    : undefined,
              },
            },
          },
        },
      },
    });
    if (range) {
      sendProtocolMessage(
        SelectEditorMessage.type.notification({
          textDocument: { uri },
          range,
          scrollIntoView: "center",
          takeFocus,
          userEvent,
        }),
      );
    }
    return { success: true };
  }

  protected setStoryFrontMatter(frontMatter: Record<string, string[]>) {
    workspace.storyFrontMatter.value = frontMatter;
  }

  async editMainAt(line: number) {
    const projectId = this.store.project.id;
    if (!projectId) {
      return;
    }
    const position = { line, character: 0 };
    await this.showDocument(
      this._workspace.fs.getFileUri(projectId, "main.sd"),
      { start: position, end: position },
      true,
    );
    this.navigateTo("write");
  }

  protected requestEditor<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
    timeout = 3000,
  ): Promise<R | null> {
    const request = type.request(params);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        stop();
        resolve(null);
      }, timeout);
      const stop = onProtocolMessage(
        {
          is: (m: unknown): m is ResponseMessage<M, R> =>
            type.isResponse(m, request.id),
        },
        (message) => {
          clearTimeout(timer);
          stop();
          resolve(("result" in message ? message.result : null) ?? null);
        },
      );
      sendProtocolMessage(request);
    });
  }

  async readEditorKeybindings(filename: string) {
    const projectId = this.store.project.id;
    if (!projectId) {
      return null;
    }
    const uri = this._workspace.fs.getFileUri(projectId, filename);
    return this.requestEditor(ReadEditorKeybindingsMessage.type, {
      textDocument: { uri },
    });
  }

  async readNameAtCaret(filename: string): Promise<NameAtCaret | null> {
    const projectId = this.store.project.id;
    const ls = this._workspace.ls;
    if (!projectId || !ls?.initialization || !ls.connection) {
      return null;
    }
    const uri = this._workspace.fs.getFileUri(projectId, filename);
    const editor = await this.requestEditor(ReadEditorMessage.type, {
      textDocument: { uri },
    });
    if (!editor) {
      return null;
    }
    const position = editor.caret;
    const textDocument = { uri };
    await ls.initialization();
    const [highlights, definitions] = await Promise.all([
      ls.connection.sendRequest<HighlightLike[] | null>(
        "textDocument/documentHighlight",
        { textDocument, position },
      ),
      ls.connection.sendRequest<HighlightLike[] | null>(
        "textDocument/definition",
        { textDocument, position },
      ),
    ]);
    const range = nameRangeAt(highlights, position);
    if (!range) {
      return null;
    }
    const text = editor.textDocument.text;
    const name = textOf(text, range);
    if (!name.trim()) {
      return null;
    }
    const definition = definitionOf(definitions);
    if (!definition) {
      return {
        uri,
        position,
        name,
        kind: isCue(lineOf(text, position.line), name) ? "character" : "name",
        definition: null,
      };
    }
    const definitionText =
      definition.uri === uri
        ? text
        : isScriptUri(definition.uri)
          ? await this._workspace.fs.getFileText(definition.uri)
          : "";
    return {
      uri,
      position,
      name,
      kind: kindOfDefinition(
        definition.uri,
        lineOf(definitionText, definition.range.start.line),
      ),
      definition,
    };
  }

  executeEditorCommand(filename: string, command: EditorCommand) {
    const projectId = this.store.project.id;
    if (!projectId) {
      return;
    }
    const uri = this._workspace.fs.getFileUri(projectId, filename);
    sendProtocolMessage(
      ExecuteEditorCommandMessage.type.request({
        textDocument: { uri },
        command,
      }),
    );
  }

  openPane(pane: PaneType) {
    this.update({
      ...this.store,
      pane,
    });
  }

  openPanel(pane: PaneType, panel: PanelType) {
    this.update({
      ...this.store,
      panes: {
        ...this.store.panes,
        [pane]: {
          ...this.store.panes[pane],
          panel,
        },
      },
    });
  }

  openView(pane: PaneType, view: string) {
    this.update({
      ...this.store,
      panes: {
        ...this.store.panes,
        [pane]: {
          ...this.store.panes[pane],
          view,
        },
      },
    });
  }

  openFileEditor(filename: string, oldFilename?: string) {
    const pane = this.getPaneType(filename);
    const panel = this.getPanelType(filename);
    if (pane && panel) {
      const activeEditor = this.store.panes[pane].panels[panel]?.activeEditor;
      const isRenaming = Boolean(oldFilename);
      const visibleRange =
        isRenaming || activeEditor?.filename === filename
          ? activeEditor?.visibleRange
          : {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            };
      const selectedRange =
        isRenaming || activeEditor?.filename === filename
          ? activeEditor?.selectedRange
          : undefined;
      this.update({
        ...this.store,
        panes: {
          ...this.store.panes,
          [pane]: {
            ...this.store.panes[pane],
            panels: {
              ...this.store.panes[pane].panels,
              [panel]: {
                ...this.store.panes[pane].panels[panel],
                activeEditor: {
                  ...this.store.panes[pane].panels[panel]!.activeEditor,
                  open: true,
                  originalFilename: oldFilename,
                  filename,
                  visibleRange,
                  selectedRange,
                },
              },
            },
          },
        },
      });
    }
  }

  closeFileEditor(filename: string) {
    const pane = this.getPaneType(filename);
    const panel = this.getPanelType(filename);
    if (pane && panel) {
      this.update({
        ...this.store,
        panes: {
          ...this.store.panes,
          [pane]: {
            ...this.store.panes[pane],
            panels: {
              ...this.store.panes[pane].panels,
              [panel]: {
                ...this.store.panes[pane].panels[panel],
                activeEditor: {
                  ...this.store.panes[pane].panels[panel]!.activeEditor,
                  open: false,
                },
              },
            },
          },
        },
      });
    }
  }

  expandPreviewPane() {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        revealed: true,
      },
    });
    sendProtocolMessage(DidExpandPreviewPaneMessage.type.notification({}));
  }

  collapsePreviewPane() {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        revealed: false,
      },
    });
    sendProtocolMessage(DidCollapsePreviewPaneMessage.type.notification({}));
  }

  setPreviewMode(mode: PreviewMode) {
    if (workspaceSettings.preferences.peek().previewMode === mode) {
      return;
    }
    this.stopGame();
    workspaceSettings.setPreference("previewMode", mode);
  }

  startEditingProjectName() {
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
        editingName: true,
      },
    });
  }

  async finishEditingProjectName(name: string) {
    const id = this.store.project.id;
    if (id) {
      const previousName = this.store.project.name;
      const check = checkName(name, previousName || "");
      const validName =
        check.status === "empty"
          ? previousName || WorkspaceConstants.DEFAULT_PROJECT_NAME
          : name;
      this.update({
        ...this.store,
        project: {
          ...this.store.project,
          name: validName,
        },
        screen: {
          ...this.store.screen,
          editingName: false,
        },
      });
      const changedName = validName !== previousName;
      if (changedName) {
        await this._workspace.fs.writeProjectMetadata(id, "name", validName);
        await this.recordScriptChange();
      }
      return changedName;
    }
    return false;
  }

  async renameScript(filename: string, draft: string): Promise<NameCheck> {
    const projectId = this.store.project.id;
    const { folder, name, ext } = splitScriptPath(filename);
    if (!projectId || filename === "main.sd") {
      return { status: "unchanged" };
    }
    const draftCheck = checkName(draft, name);
    if (draftCheck.status !== "renamed") {
      if (draftCheck.status === "invalid") {
        showSnackbar({ message: "A script name can't contain a slash." });
      } else if (draftCheck.status === "empty") {
        showSnackbar({ message: "A script needs a name." });
      }
      return draftCheck;
    }
    const fs = this._workspace.fs;
    const files = await fs.getFiles(projectId);
    const taken = Object.keys(files)
      .map((uri) => fs.getRelativePath(projectId, uri))
      .filter((path) => path !== filename)
      .map((path) => splitScriptPath(path))
      .filter((other) => other.folder === folder && other.ext === ext)
      .map((other) => other.name);
    const check = checkName(draft, name, taken);
    if (check.status === "collision") {
      showSnackbar({ message: `A script named ${check.name} already exists.` });
    }
    if (check.status !== "renamed") {
      return check;
    }
    const newFilename = joinScriptPath(folder, check.name, ext);
    const rename = await renameOrReport(filename, newFilename, () =>
      fs.renameFileWithReferences(projectId, filename, newFilename),
    );
    if (!rename.renamed) {
      return check;
    }
    const { referencesUpdated } = rename.result;
    await this.recordScriptChange();
    this.followRenamedScript(filename, newFilename);
    showSnackbar({
      message:
        referencesUpdated > 0
          ? `Renamed to ${check.name}. Linked includes were updated.`
          : `Renamed to ${check.name}.`,
    });
    return check;
  }

  private followRenamedScript(from: string, to: string) {
    const logic = this.store.panes.logic;
    const scripts = logic.panels.scripts;
    const editor = scripts?.activeEditor;
    if (!scripts || !editor || editor.filename !== from) {
      return;
    }
    if (editor.open) {
      this.openFileEditor(to, from);
      return;
    }
    this.update({
      ...this.store,
      panes: {
        ...this.store.panes,
        logic: {
          ...logic,
          panels: {
            ...logic.panels,
            scripts: { ...scripts, activeEditor: { ...editor, filename: to } },
          },
        },
      },
    });
  }

  startPickingRemoteProjectResource() {
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
        pickingResource: true,
      },
    });
  }

  finishPickingRemoteProjectResource() {
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
        pickingResource: false,
      },
    });
  }

  startGame() {
    if (!this.store.preview.modes.game.running) {
      this.update({
        ...this.store,
        preview: {
          ...this.store.preview,
          modes: {
            ...this.store.preview.modes,
            game: {
              ...this.store.preview.modes.game,
              loading: false,
              running: true,
              paused: false,
              picks: {},
            },
          },
        },
      });
      const request = StartGameMessage.type.request({});
      this._startGameRequestId = request.id;
      sendProtocolMessage(request);
      void this.debug.start(this.getOpenedDocumentUri() ?? "");
    }
  }

  endGame() {
    if (this.store.preview.modes.game.running) {
      this.update({
        ...this.store,
        preview: {
          ...this.store.preview,
          modes: {
            ...this.store.preview.modes,
            game: {
              ...this.store.preview.modes.game,
              loading: false,
              running: false,
              ended: false,
              choosing: false,
              picks: {},
            },
          },
        },
      });
      this.debug.end();
    }
  }

  syncGameEnded(ended: boolean) {
    const game = this.store.preview.modes.game;
    if (!game.running || (Boolean(game.ended) === ended && !game.loading)) {
      return;
    }
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        modes: {
          ...this.store.preview.modes,
          game: { ...game, ended, loading: false },
        },
      },
    });
  }

  replayGame() {
    const game = this.store.preview.modes.game;
    if (!game.running || !game.ended || game.loading) {
      return;
    }
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        modes: {
          ...this.store.preview.modes,
          game: { ...game, loading: true, picks: {} },
        },
      },
    });
    sendProtocolMessage(RestartGameMessage.type.request({}));
  }

  stopGame() {
    if (this.store.preview.modes.game.running) {
      this.endGame();
      sendProtocolMessage(StopGameMessage.type.request({}));
    }
  }

  async pauseGame() {
    const game = this.store.preview.modes.game;
    if (game.running && !game.paused && (await this.debug.pause())) {
      this.syncGamePaused(true);
    }
  }

  async unpauseGame() {
    if (this.store.preview.modes.game.paused && (await this.debug.continue())) {
      this.syncGamePaused(false);
    }
  }

  syncGameSize(size: GameSize) {
    const game = this.store.preview.modes.game;
    const last = game.size;
    if (
      last &&
      last.width === size.width &&
      last.height === size.height &&
      last.aspectRatio === size.aspectRatio
    ) {
      return;
    }
    this.updateGame({ ...game, size });
  }

  syncGamePosition(position: GamePosition) {
    const game = this.store.preview.modes.game;
    const last = game.position;
    if (last?.uri === position.uri && last.line === position.line) {
      return;
    }
    this.updateGame({ ...game, position });
  }

  protected updateGame(game: GameState) {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        modes: { ...this.store.preview.modes, game },
      },
    });
  }

  syncGameChose(option?: { uri: string; line: number }) {
    const game = this.store.preview.modes.game;
    if (!game.running) {
      return;
    }
    const picks = game.picks ?? {};
    const picked = option ? (picks[option.uri] ?? []) : [];
    this.updateGame({
      ...game,
      choosing: false,
      picks:
        option && !picked.includes(option.line)
          ? { ...picks, [option.uri]: [...picked, option.line] }
          : picks,
    });
  }

  syncGameChoosing(choosing: boolean) {
    const game = this.store.preview.modes.game;
    if (Boolean(game.choosing) === choosing || (choosing && !game.running)) {
      return;
    }
    this.updateGame({ ...game, choosing });
  }

  async revealDocument(uri: string, range?: Range, takeFocus = true) {
    if (typeof document !== "undefined" && document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
    if (this.store.preview.revealed) {
      this.collapsePreviewPane();
    }
    const result = await this.showDocument(uri, range, takeFocus);
    if (routeOfState(this.store) !== "write") {
      this.navigateTo("write");
    }
    return result;
  }

  syncGamePaused(paused: boolean) {
    const game = this.store.preview.modes.game;
    if (!game.running || Boolean(game.paused) === paused) {
      return;
    }
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        modes: {
          ...this.store.preview.modes,
          game: { ...game, paused },
        },
      },
    });
  }

  async stepGame(traversal: StepTraversal) {
    const game = this.store.preview.modes.game;
    if (!game.running || stepRefusals(game, workspace.debugSession.peek())[traversal]) {
      return false;
    }
    return traversal === "over"
      ? this.debug.next()
      : traversal === "in"
        ? this.debug.stepIn()
        : this.debug.stepOut();
  }

  followRoll(restored: SettledBeat) {
    this.syncGameChoosing(restored.choices.length > 0);
    const location = restored.location;
    if (location) {
      this.followPosition({
        uri: location.uri,
        line: location.range.start.line,
      });
    }
  }

  followPosition(position: GamePosition) {
    this.syncGamePosition(position);
    const at = { line: position.line, character: 0 };
    void this.showDocument(position.uri, { start: at, end: at }, false);
  }

  followStop(position: GamePosition) {
    this.syncGamePaused(true);
    const highlights = this.store.debug.highlights ?? {};
    const lines = highlights[position.uri] ?? [];
    if (!lines.includes(position.line)) {
      this.setHighlights({
        ...highlights,
        [position.uri]: [...lines, position.line].sort((a, b) => a - b),
      });
    }
    this.followPosition(position);
  }

  continueGame() {
    const game = this.store.preview.modes.game;
    if (game.running && !game.ended && !game.paused) {
      sendProtocolMessage(ContinueGameMessage.type.request({}));
    }
  }

  async skipBeat(
    direction: SkipDirection,
    to: RollDebugTarget = "beat",
  ): Promise<boolean> {
    const game = this.store.preview.modes.game;
    if (game.running) {
      if (skipRefusal(game, workspace.debugSession.peek(), direction)) {
        return false;
      }
      return direction < 0 ? this.debug.rollBack(to) : this.debug.rollForward(to);
    }
    const ls = this._workspace.ls;
    if (!ls) {
      return false;
    }
    this._skipBeat ??= createPreviewBeatSkipper({ window: this, ls });
    return this._skipBeat(direction);
  }

  toggleGameRunning() {
    if (this.store.preview.modes.game.running) {
      this.stopGame();
    } else if (!this.store.preview.modes.game.playRefusal) {
      this.startGame();
    }
  }

  unloadProject() {
    const id = WorkspaceConstants.LOCAL_PROJECT_ID;
    this.setStoryFrontMatter({});
    this.update({
      ...this.store,
      project: {
        ...this.store.project,
        id,
        directory: this._workspace.fs.getDirectoryUri(id),
        name: undefined,
      },
      sync: {
        ...this.store.sync,
        status: "loading",
      },
      screen: {
        ...this.store.screen,
        editingName: false,
      },
    });
  }

  loadNewProject(id: string) {
    this.cacheProjectId(id);
    location.reload();
  }

  async loadProject() {
    return this._loadProjectRef.get();
  }

  protected async _loadProject() {
    try {
      const id = this.store.project.id || WorkspaceConstants.LOCAL_PROJECT_ID;
      if (id === WorkspaceConstants.LOCAL_PROJECT_ID) {
        const name =
          (await this._workspace.fs.readProjectMetadata(id, "name")) ||
          WorkspaceConstants.DEFAULT_PROJECT_NAME;
        this.update({
          ...this.store,
          project: {
            ...this.store.project,
            id,
            directory: this._workspace.fs.getDirectoryUri(id),
            name,
          },
          sync: {
            ...this.store.sync,
            status: "cached",
          },
          screen: {
            ...this.store.screen,
            editingName: false,
          },
        });
      } else {
        await this.syncProject(false);
      }
      this.cacheProjectId(id);
      return id;
    } catch (err: any) {
      console.error(err, err.stack);
      this.update({
        ...this.store,
        sync: {
          ...this.store.sync,
          status: "load_error",
        },
      });
    }
    return undefined;
  }

  async syncProject(pushLocalChanges = true) {
    try {
      const id = this.store.project.id;
      if (id && id !== "local") {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "syncing",
          },
        });
        const revisions =
          await this._workspace.sync.google.getFileRevisions(id);
        if (revisions) {
          this.update({
            ...this.store,
            sync: {
              ...this.store.sync,
              revisions,
            },
          });
          const projectTextRevision = revisions.findLast(
            (r) => r.mimeType === "text/plain",
          );
          const projectZipRevision = revisions.findLast(
            (r) => r.mimeType === "application/zip",
          );
          const remoteProjectExists = projectTextRevision || projectZipRevision;
          const textSyncStatus = remoteProjectExists
            ? await this.syncText(id, projectTextRevision, pushLocalChanges)
            : "cached";
          const zipSyncStatus = remoteProjectExists
            ? await this.syncZip(id, projectZipRevision, pushLocalChanges)
            : "cached";
          const syncState =
            textSyncStatus === "unsynced" || zipSyncStatus === "unsynced"
              ? "unsynced"
              : textSyncStatus === "sync_conflict" ||
                  zipSyncStatus === "sync_conflict"
                ? "sync_conflict"
                : textSyncStatus;
          const name =
            (await this._workspace.fs.readProjectMetadata(id, "name")) ||
            WorkspaceConstants.DEFAULT_PROJECT_NAME;
          this.update({
            ...this.store,
            project: {
              ...this.store.project,
              name,
            },
            sync: {
              ...this.store.sync,
              status: syncState,
            },
          });
        } else {
          console.error(`Could not fetch remote project file: ${id}`);
          const name =
            (await this._workspace.fs.readProjectMetadata(id, "name")) ||
            WorkspaceConstants.DEFAULT_PROJECT_NAME;
          this.update({
            ...this.store,
            project: {
              ...this.store.project,
              name,
            },
            sync: {
              ...this.store.sync,
              status: "offline",
            },
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        sync: {
          ...this.store.sync,
          status: "sync_error",
        },
      });
    }
  }

  async resolveConflictWithPull() {
    try {
      const id = this.store.project.id;
      if (id) {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "syncing",
          },
        });
        const revisions =
          await this._workspace.sync.google.getFileRevisions(id);
        if (revisions) {
          const projectTextRevision = revisions.findLast(
            (r) => r.mimeType === "text/plain",
          );
          const projectZipRevision = revisions.findLast(
            (r) => r.mimeType === "application/zip",
          );
          if (projectTextRevision) {
            await this.pullRemoteScriptBundleChanges(id, projectTextRevision);
          }
          if (projectZipRevision) {
            await this.pullRemoteAssetBundleChanges(id, projectZipRevision);
          }
          const name =
            (await this._workspace.fs.readProjectMetadata(id, "name")) ||
            WorkspaceConstants.DEFAULT_PROJECT_NAME;
          this.update({
            ...this.store,
            project: {
              ...this.store.project,
              name,
            },
            sync: {
              ...this.store.sync,
              status:
                projectTextRevision && projectZipRevision ? "synced" : "cached",
            },
          });
        } else {
          console.error(`Could not fetch remote project file: ${id}`);
          const name =
            (await this._workspace.fs.readProjectMetadata(id, "name")) ||
            WorkspaceConstants.DEFAULT_PROJECT_NAME;
          this.update({
            ...this.store,
            project: {
              ...this.store.project,
              name,
            },
            sync: {
              ...this.store.sync,
              status: "offline",
            },
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        sync: {
          ...this.store.sync,
          status: "sync_error",
        },
      });
    }
  }

  async resolveConflictWithPush() {
    try {
      const id = this.store.project.id;
      if (id) {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "syncing",
          },
        });
        await this.pushLocalTextChanges(id);
        await this.pushLocalZipChanges(id);
        await this.pushLocalTextChanges(id);
        const name =
          (await this._workspace.fs.readProjectMetadata(id, "name")) ||
          WorkspaceConstants.DEFAULT_PROJECT_NAME;
        this.update({
          ...this.store,
          project: {
            ...this.store.project,
            name,
          },
          sync: {
            ...this.store.sync,
            status: "synced",
          },
        });
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        sync: {
          ...this.store.sync,
          status: "sync_error",
        },
      });
    }
  }

  protected async syncText(
    fileId: string,
    projectTextRevision: RemoteStorage.Revision | undefined,
    pushLocalChanges: boolean,
  ): Promise<SyncStatus> {
    const textRevisionId = await this._workspace.fs.readProjectMetadata(
      fileId,
      "textRevisionId",
    );
    const textSynced = await this._workspace.fs.readProjectMetadata(
      fileId,
      "textSynced",
    );
    const remoteTextChanged =
      projectTextRevision?.id && projectTextRevision?.id !== textRevisionId;
    const localTextChanged = textSynced === "false";
    if (!remoteTextChanged && localTextChanged) {
      if (pushLocalChanges) {
        await this.pushLocalTextChanges(fileId);
        return "synced";
      }
      return "unsynced";
    }
    if (remoteTextChanged && !localTextChanged) {
      await this.pullRemoteScriptBundleChanges(fileId, projectTextRevision);
      return "synced";
    }
    if (remoteTextChanged && localTextChanged) {
      return "sync_conflict";
    }
    return "synced";
  }

  protected async pushLocalTextChanges(fileId: string) {
    const projectName =
      (await this._workspace.fs.readProjectMetadata(fileId, "name")) ||
      WorkspaceConstants.DEFAULT_PROJECT_NAME;
    const content = await this._workspace.fs.readProjectScriptBundle(fileId);
    const filename =
      this._workspace.sync.google.getProjectFilename(projectName);
    const remoteProjectFile =
      await this._workspace.sync.google.updateProjectFile(
        fileId,
        createTextFile(filename, content),
      );
    const remoteProjectName = remoteProjectFile.name!.split(".")[0]!;
    await Promise.all([
      this._workspace.fs.writeProjectMetadata(
        fileId,
        "name",
        remoteProjectName,
      ),
      this._workspace.fs.writeProjectMetadata(
        fileId,
        "textRevisionId",
        remoteProjectFile.headRevisionId!,
      ),
      this._workspace.fs.writeProjectMetadata(
        fileId,
        "textSynced",
        String(true),
      ),
    ]);
    return remoteProjectFile;
  }

  async pullRemoteScriptBundleChanges(
    fileId: string,
    revision: RemoteStorage.Revision,
  ) {
    const remoteProjectTextContent =
      await this._workspace.sync.google.getFileRevision(
        fileId,
        revision.id!,
        "text",
      );
    const remoteProjectName = revision.originalFilename!.split(".")[0]!;
    await this._workspace.fs.writeProjectScriptBundle(
      fileId,
      remoteProjectTextContent || "",
    );
    await Promise.all([
      this._workspace.fs.writeProjectMetadata(
        fileId,
        "name",
        remoteProjectName,
      ),
      this._workspace.fs.writeProjectMetadata(
        fileId,
        "textRevisionId",
        revision.id!,
      ),
      this._workspace.fs.writeProjectMetadata(
        fileId,
        "textSynced",
        String(true),
      ),
    ]);
    this.update({
      ...this.store,
      sync: {
        ...this.store.sync,
        textPulledAt: revision.modifiedTime,
      },
    });
  }

  protected async syncZip(
    fileId: string,
    projectZipRevision: RemoteStorage.Revision | undefined,
    pushLocalChanges: boolean,
  ): Promise<SyncStatus> {
    const zipRevisionId = await this._workspace.fs.readProjectMetadata(
      fileId,
      "zipRevisionId",
    );
    const zipSynced = await this._workspace.fs.readProjectMetadata(
      fileId,
      "zipSynced",
    );
    const remoteZipChanged =
      projectZipRevision?.id && projectZipRevision?.id !== zipRevisionId;
    const localZipChanged = zipSynced === "false";
    if (!remoteZipChanged && localZipChanged) {
      if (pushLocalChanges) {
        await this.pushLocalZipChanges(fileId);
        await this.pushLocalTextChanges(fileId);
        return "synced";
      }
      return "unsynced";
    }
    if (remoteZipChanged && !localZipChanged) {
      await this.pullRemoteAssetBundleChanges(fileId, projectZipRevision);
      return "synced";
    }
    if (remoteZipChanged && localZipChanged) {
      return "sync_conflict";
    }
    return "synced";
  }

  async pushLocalZipChanges(fileId: string) {
    const projectName =
      (await this._workspace.fs.readProjectMetadata(fileId, "name")) ||
      WorkspaceConstants.DEFAULT_PROJECT_NAME;
    const content = await this._workspace.fs.readProjectAssetBundle(fileId);
    const filename =
      this._workspace.sync.google.getProjectFilename(projectName);
    const remoteProjectFile =
      await this._workspace.sync.google.updateProjectFile(
        fileId,
        createZipFile(filename, content),
      );
    const remoteProjectName =
      remoteProjectFile?.name?.split(".")[0] || projectName;
    await Promise.all([
      this._workspace.fs.writeProjectMetadata(
        fileId,
        "name",
        remoteProjectName,
      ),
      this._workspace.fs.writeProjectMetadata(
        fileId,
        "zipRevisionId",
        remoteProjectFile.headRevisionId!,
      ),
      this._workspace.fs.writeProjectMetadata(
        fileId,
        "zipSynced",
        String(true),
      ),
    ]);
    return remoteProjectFile;
  }

  protected async pullRemoteAssetBundleChanges(
    fileId: string,
    revision: RemoteStorage.Revision,
  ) {
    const remoteProjectZipContent =
      await this._workspace.sync.google.getFileRevision(
        fileId,
        revision.id!,
        "arraybuffer",
      );
    const remoteProjectName = revision.originalFilename!.split(".")[0]!;
    await this._workspace.fs.writeProjectAssetBundle(
      fileId,
      remoteProjectZipContent,
    );
    await Promise.all([
      this._workspace.fs.writeProjectMetadata(
        fileId,
        "name",
        remoteProjectName,
      ),
      this._workspace.fs.writeProjectMetadata(
        fileId,
        "zipRevisionId",
        revision.id!,
      ),
      this._workspace.fs.writeProjectMetadata(
        fileId,
        "zipSynced",
        String(true),
      ),
    ]);
    this.update({
      ...this.store,
      sync: {
        ...this.store.sync,
        zipPulledAt: revision.modifiedTime,
      },
    });
  }

  async exportLocalProject() {
    try {
      const projectId = this.store.project.id;
      if (projectId) {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "exporting",
          },
        });
        const settingsJson = projectSettingsJson(
          workspaceSettings.projectSettings.peek(),
          await loadExtensionDefaults(),
        );
        const projectZip = await this._workspace.fs.readProjectZip(
          projectId,
          settingsJson,
        );
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "cached",
          },
        });
        return projectZip;
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        sync: {
          ...this.store.sync,
          status: "export_error",
        },
      });
    }
    return undefined;
  }

  async importLocalProject(fileName: string, fileBuffer: ArrayBuffer) {
    try {
      const projectId = this.store.project.id;
      if (projectId) {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "importing",
          },
        });
        const extIndex = fileName.indexOf(".");
        const name = extIndex >= 0 ? fileName.slice(0, extIndex) : fileName;
        const [settingsJson] = await Promise.all([
          this._workspace.fs.writeProjectZip(projectId, fileBuffer),
          this._workspace.fs.writeProjectMetadata(projectId, "name", name),
        ]);
        workspaceSettings.replaceProjectSettings(
          projectId,
          settingsJson === undefined
            ? {}
            : projectSettingsFromJson(settingsJson),
        );
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "cached",
          },
        });
        this.loadNewProject(projectId);
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        sync: {
          ...this.store.sync,
          status: "import_error",
        },
      });
    }
    return undefined;
  }

  async saveRemoteProject(folderId: string) {
    try {
      const projectId = this.store.project.id;
      if (projectId) {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "exporting",
          },
        });
        const projectName =
          (await this._workspace.fs.readProjectMetadata(projectId, "name")) ||
          WorkspaceConstants.DEFAULT_PROJECT_NAME;
        const filename =
          this._workspace.sync.google.getProjectFilename(projectName);
        const uploaded = await this.backUpProject(async () => {
          const projectTextContent =
            await this._workspace.fs.readProjectScriptBundle(projectId);
          const projectZipContent =
            await this._workspace.fs.readProjectAssetBundle(projectId);
          const remoteProjectZipFile =
            await this._workspace.sync.google.createProjectFile(
              folderId,
              createZipFile(filename, projectZipContent),
            );
          const projectFileId = remoteProjectZipFile?.id;
          if (!projectFileId) {
            return null;
          }
          const remoteProjectTextFile =
            await this._workspace.sync.google.updateProjectFile(
              projectFileId,
              createTextFile(filename, projectTextContent),
            );
          return { projectFileId, remoteProjectZipFile, remoteProjectTextFile };
        }, projectId);
        if (uploaded) {
          const { projectFileId, remoteProjectZipFile, remoteProjectTextFile } =
            uploaded;
          await Promise.all([
            this._workspace.fs.writeProjectMetadata(
              projectFileId,
              "name",
              projectName,
            ),
            this._workspace.fs.writeProjectMetadata(
              projectFileId,
              "textRevisionId",
              remoteProjectTextFile.headRevisionId!,
            ),
            this._workspace.fs.writeProjectMetadata(
              projectFileId,
              "textSynced",
              String(true),
            ),
            this._workspace.fs.writeProjectMetadata(
              projectFileId,
              "zipRevisionId",
              remoteProjectZipFile.headRevisionId!,
            ),
            this._workspace.fs.writeProjectMetadata(
              projectFileId,
              "zipSynced",
              String(true),
            ),
          ]);
          this.loadNewProject(projectFileId);
        } else {
          this.update({
            ...this.store,
            sync: {
              ...this.store.sync,
              status: "cached",
            },
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        sync: {
          ...this.store.sync,
          status: "export_error",
        },
      });
    }
  }

  async recordScriptChange() {
    const projectId = this.store.project.id;
    if (projectId) {
      await this._workspace.fs.writeProjectMetadata(
        projectId,
        "textSynced",
        String(false),
      );
      if (projectId !== "local") {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "unsynced",
          },
        });
      }
    }
  }

  async recordAssetChange() {
    const projectId = this.store.project.id;
    if (projectId) {
      await this._workspace.fs.writeProjectMetadata(
        projectId,
        "zipSynced",
        String(false),
      );
      if (projectId !== "local") {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "unsynced",
          },
        });
      }
    }
  }
}
