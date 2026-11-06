import workspaceSettings from "./settings/WorkspaceSettings";
import WorkspaceConfiguration from "./WorkspaceConfiguration";
import WorkspaceFileSystem from "./WorkspaceFileSystem";
import WorkspaceLanguageServer from "./WorkspaceLanguageServer";
import WorkspacePrint from "./WorkspacePrint";
import WorkspaceSearch from "./WorkspaceSearch";
import { searchSources } from "./searchSources";
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
  export const sync = new WorkspaceSync();
  export const print = new WorkspacePrint();
  export const search = new WorkspaceSearch(
    searchSources({ window, ls, fs, settings }),
  );
}

registerWorkspaceProtocol(Workspace);
if (import.meta.env.DEV) {
  void import("./devProtocolBridge").then(({ installProtocolBridge }) => {
    const dispose = installProtocolBridge();
    import.meta.hot?.dispose(dispose);
  });
}
