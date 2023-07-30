import WorkspaceFileSystem from "./WorkspaceFileSystem";
import WorkspaceLanguageServerProtocol from "./WorkspaceLanguageServerProtocol";
import WorkspaceWindow from "./WorkspaceWindow";

export namespace Workspace {
  export const lsp = new WorkspaceLanguageServerProtocol();
  export const fs = new WorkspaceFileSystem(Workspace.lsp);
  export const window = new WorkspaceWindow(Workspace.fs);
}
