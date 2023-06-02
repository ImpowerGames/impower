import * as vscode from "vscode";
import { getStateFromSuffix } from "../utils/getStateFromSuffix";

export class SparkdownOutlineFileDecorationProvider
  implements vscode.FileDecorationProvider
{
  public readonly onDidChangeFileDecorationsEmitter: vscode.EventEmitter<
    undefined | vscode.Uri | vscode.Uri[]
  > = new vscode.EventEmitter<undefined | vscode.Uri | vscode.Uri[]>();
  public readonly onDidChangeFileDecorations: vscode.Event<
    undefined | vscode.Uri | vscode.Uri[]
  > = this.onDidChangeFileDecorationsEmitter.event;

  private _disposables: vscode.Disposable[];

  constructor() {
    this._disposables = [];
    this._disposables.push(vscode.window.registerFileDecorationProvider(this));
  }

  uri?: vscode.Uri;

  uris: Record<string, vscode.Uri> = {};

  provideFileDecoration(
    uri: vscode.Uri
  ): vscode.ProviderResult<vscode.FileDecoration> {
    if (!this.uris[uri.path]) {
      this.uris[uri.path] = uri;
      const state = getStateFromSuffix(uri.path);
      if (state === "error") {
        return {
          tooltip: `Error`,
          color: new vscode.ThemeColor(
            "gitDecoration.deletedResourceForeground"
          ),
          badge: "!",
        };
      }
      if (state === "warning") {
        return {
          tooltip: `Warning`,
          color: new vscode.ThemeColor(
            "gitDecoration.modifiedResourceForeground"
          ),
          badge: "?",
        };
      }
      if (state === "info") {
        return {
          tooltip: `Info`,
          color: new vscode.ThemeColor(
            "gitDecoration.renamedResourceForeground"
          ),
          badge: "i",
        };
      }
    }
    return {};
  }

  dispose() {
    this._disposables.forEach((d) => d.dispose());
  }

  async update(uri: vscode.Uri | undefined): Promise<void> {
    this.uri = uri;
    this.uris = {};
    this.onDidChangeFileDecorationsEmitter.fire(undefined);
  }
}
