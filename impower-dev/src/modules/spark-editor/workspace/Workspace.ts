import WorkspaceConfiguration from "./WorkspaceConfiguration";
import WorkspaceFileSystem from "./WorkspaceFileSystem";
import WorkspaceLanguageServerProtocol from "./WorkspaceLanguageServerProtocol";
import WorkspaceWindow from "./WorkspaceWindow";

export namespace Workspace {
  export const configuration = new WorkspaceConfiguration();
  export const lsp = new WorkspaceLanguageServerProtocol(
    Workspace.configuration
  );
  export const fs = new WorkspaceFileSystem(
    Workspace.lsp,
    Workspace.configuration
  );
  export const window = new WorkspaceWindow(Workspace.fs);
}
