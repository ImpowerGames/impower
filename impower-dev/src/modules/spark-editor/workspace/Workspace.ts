import WorkspaceConfiguration from "./WorkspaceConfiguration";
import WorkspaceFileSystem from "./WorkspaceFileSystem";
import WorkspaceLanguageServerProtocol from "./WorkspaceLanguageServerProtocol";
import WorkspaceSync from "./WorkspaceSync";
import WorkspaceWindow from "./WorkspaceWindow";

export namespace Workspace {
  export const LOCAL_PROJECT_ID = "local";
  export const DEFAULT_PROJECT_NAME = "Untitled Project";
  export const configuration = new WorkspaceConfiguration();
  export const lsp = new WorkspaceLanguageServerProtocol();
  export const window = new WorkspaceWindow();
  export const fs = new WorkspaceFileSystem();
  export const sync = new WorkspaceSync();
}
