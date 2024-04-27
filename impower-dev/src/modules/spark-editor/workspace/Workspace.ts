import WorkspaceConfiguration from "./WorkspaceConfiguration";
import WorkspaceFileSystem from "./WorkspaceFileSystem";
import WorkspaceLanguageServer from "./WorkspaceLanguageServer";
import WorkspacePrint from "./WorkspacePrint";
import WorkspaceSync from "./WorkspaceSync";
import WorkspaceWindow from "./WorkspaceWindow";

export namespace Workspace {
  export const configuration = new WorkspaceConfiguration();
  export const window = new WorkspaceWindow();
  export const ls = new WorkspaceLanguageServer();
  export const fs = new WorkspaceFileSystem();
  export const sync = new WorkspaceSync();
  export const print = new WorkspacePrint();
}
