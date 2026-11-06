import workspaceSettings from "./settings/WorkspaceSettings";
import WorkspaceConfiguration from "./WorkspaceConfiguration";
import WorkspaceFileSystem from "./WorkspaceFileSystem";
import WorkspaceLanguageServer from "./WorkspaceLanguageServer";
import WorkspaceOutline from "./WorkspaceOutline";
import WorkspacePrint from "./WorkspacePrint";
import WorkspaceScripts from "./WorkspaceScripts";
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
  export const scripts = new WorkspaceScripts({ fs, ls, window });
  export const sync = new WorkspaceSync();
  export const print = new WorkspacePrint();
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
if (import.meta.env.DEV) {
  void import("./devProtocolBridge").then(({ installProtocolBridge }) => {
    const dispose = installProtocolBridge();
    import.meta.hot?.dispose(dispose);
  });
}
