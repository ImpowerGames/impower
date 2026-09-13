import WorkspaceConfiguration from "./WorkspaceConfiguration";
import WorkspaceFileSystem from "./WorkspaceFileSystem";
import WorkspaceLanguageServer from "./WorkspaceLanguageServer";
import WorkspacePrint from "./WorkspacePrint";
import WorkspaceSync from "./WorkspaceSync";
import WorkspaceWindow from "./WorkspaceWindow";
import { registerWorkspaceProtocol } from "./workspaceProtocol";

export namespace Workspace {
  export const configuration = new WorkspaceConfiguration();
  export const window = new WorkspaceWindow();
  export const ls = new WorkspaceLanguageServer();
  export const fs = new WorkspaceFileSystem();
  export const sync = new WorkspaceSync();
  export const print = new WorkspacePrint();
}

registerWorkspaceProtocol();
if (import.meta.env.DEV) {
  void import("./devProtocolBridge").then(({ installProtocolBridge }) => {
    const dispose = installProtocolBridge();
    import.meta.hot?.dispose(dispose);
  });
}
