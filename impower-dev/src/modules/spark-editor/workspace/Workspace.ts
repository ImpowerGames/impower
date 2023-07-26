import WorkspaceFileSystem from "./WorkspaceFileSystem";
import WorkspaceLanguageServerProtocol from "./WorkspaceLanguageServerProtocol";
import WorkspaceWindow from "./WorkspaceWindow";

export default abstract class Workspace {
  static _window = new WorkspaceWindow();
  static get window() {
    return this._window;
  }

  static _lsp = new WorkspaceLanguageServerProtocol(this.window);
  static get lsp() {
    return this._lsp;
  }

  static _fs = new WorkspaceFileSystem(this.window, this.lsp);
  static get fs() {
    return this._fs;
  }
}
