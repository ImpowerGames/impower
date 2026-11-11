import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  choiceMadeSource,
  consoleToggleSource,
  runStartSource,
  runtimeErrorSource,
} from "./problems/gameSources";
import problems from "./problems/ProblemsStore";
import route from "./route/RouteStore";
import workspaceSettings from "./settings/WorkspaceSettings";
import WorkspaceConfiguration from "./WorkspaceConfiguration";
import WorkspaceFileSystem from "./WorkspaceFileSystem";
import WorkspaceLanguageServer from "./WorkspaceLanguageServer";
import WorkspaceOutline from "./WorkspaceOutline";
import WorkspacePrint from "./WorkspacePrint";
import WorkspaceAssets from "./WorkspaceAssets";
import WorkspaceScripts from "./WorkspaceScripts";
import WorkspaceSearch from "./WorkspaceSearch";
import { searchSources } from "./searchSources";
import workspace from "./WorkspaceStore";
import WorkspaceSync from "./WorkspaceSync";
import WorkspaceWindow from "./WorkspaceWindow";
import { registerWorkspaceProtocol } from "./workspaceProtocol";

export namespace Workspace {
  export const settings = workspaceSettings;
  export const configuration = new WorkspaceConfiguration(settings);
  export const window: WorkspaceWindow = new WorkspaceWindow(Workspace);
  export const ls: WorkspaceLanguageServer = new WorkspaceLanguageServer(
    Workspace,
  );
  export const fs: WorkspaceFileSystem = new WorkspaceFileSystem(
    ls,
    configuration,
  );
  export const autoRenameFiles = () =>
    settings.preferences.peek().autoRenameFiles;
  export const scripts = new WorkspaceScripts({
    fs,
    ls,
    window,
    autoRenameFiles,
  });
  export const assets = new WorkspaceAssets({ fs, ls, window, autoRenameFiles });
  export const sync = new WorkspaceSync();
  export const print = new WorkspacePrint();
  export const search = new WorkspaceSearch(
    searchSources({ window, ls, fs, settings }),
  );
  export const outline = new WorkspaceOutline({
    openedUri: () => {
      void workspace.state.value;
      return window.getActiveEditorForPane("logic")?.uri;
    },
    getDocumentSymbols: (uri) => ls.getDocumentSymbols(uri),
    getFileText: (uri) => fs.getFileText(uri),
    onPublishedDiagnostics: (listener) => ls.onPublishedDiagnostics(listener),
  });
}

registerWorkspaceProtocol(Workspace);
problems.addPlayedSource(runtimeErrorSource);
problems.addPlayedSource(choiceMadeSource);
problems.addRunSource(runStartSource);
problems.addPanelSource(consoleToggleSource);
if (typeof window !== "undefined") {
  window.addEventListener(MessageProtocol.event, (event) => {
    if (event instanceof CustomEvent) {
      problems.receive(event.detail);
      route.receive(event.detail);
    }
  });
}
if (import.meta.env.DEV) {
  void import("./devProtocolBridge").then(({ installProtocolBridge }) => {
    const dispose = installProtocolBridge();
    import.meta.hot?.dispose(dispose);
  });
}
