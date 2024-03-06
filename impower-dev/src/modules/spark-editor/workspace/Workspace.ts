import WorkspaceConfiguration from "./WorkspaceConfiguration";
import WorkspaceFileSystem from "./WorkspaceFileSystem";
import WorkspaceLanguageServerProtocol from "./WorkspaceLanguageServerProtocol";
import WorkspacePrint from "./WorkspacePrint";
import WorkspaceSync from "./WorkspaceSync";
import WorkspaceWindow from "./WorkspaceWindow";

export namespace Workspace {
  export const configuration = new WorkspaceConfiguration();
  export const lsp = new WorkspaceLanguageServerProtocol();
  export const window = new WorkspaceWindow();
  export const fs = new WorkspaceFileSystem();
  export const sync = new WorkspaceSync();
  export const print = new WorkspacePrint();
}
