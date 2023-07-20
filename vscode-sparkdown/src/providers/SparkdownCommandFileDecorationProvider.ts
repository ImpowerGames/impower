import * as vscode from "vscode";
import { fileStat } from "../utils/fileStat";
import { getEditor } from "../utils/getEditor";

export class SparkdownCommandFileDecorationProvider
  implements vscode.FileDecorationProvider
{
  private static _instance: SparkdownCommandFileDecorationProvider;
  static get instance(): SparkdownCommandFileDecorationProvider {
    if (!this._instance) {
      this._instance = new SparkdownCommandFileDecorationProvider();
    }
    return this._instance;
  }

  public readonly onDidChangeFileDecorationsEmitter: vscode.EventEmitter<
    undefined | vscode.Uri | vscode.Uri[]
  > = new vscode.EventEmitter<undefined | vscode.Uri | vscode.Uri[]>();
  public readonly onDidChangeFileDecorations: vscode.Event<
    undefined | vscode.Uri | vscode.Uri[]
  > = this.onDidChangeFileDecorationsEmitter.event;

  uri?: vscode.Uri;

  uris: Record<string, vscode.Uri> = {};

  private _disposables: vscode.Disposable[];

  private _stat?: vscode.FileStat;

  private _commandUris: {
    pdf?: vscode.Uri;
    html?: vscode.Uri;
    csv?: vscode.Uri;
    json?: vscode.Uri;
  } = {};

  private _commandStats: Record<string, vscode.FileStat | undefined> = {};

  constructor() {
    this._disposables = [];
    this._disposables.push(vscode.window.registerFileDecorationProvider(this));
  }

  provideFileDecoration(
    uri: vscode.Uri
  ): vscode.ProviderResult<vscode.FileDecoration> {
    this.uris[uri.path] = uri;
    const sourceStat = this._stat;
    const commandStat = this._commandStats[uri.path];
    const modified =
      sourceStat &&
      commandStat &&
      (sourceStat?.mtime || 0) > (commandStat?.mtime || 0);
    if (modified) {
      return {
        tooltip: `Source has new changes`,
        color: new vscode.ThemeColor(
          "gitDecoration.modifiedResourceForeground"
        ),
        badge: "*",
      };
    }
    return {};
  }

  dispose() {
    this._disposables.forEach((d) => d.dispose());
  }

  async update(uri: vscode.Uri | undefined): Promise<void> {
    this.uri = uri;
    this.uris = {};
    this._commandUris = {};
    this._commandStats = {};
    const editor = getEditor(uri);
    if (uri && editor) {
      const filename = editor.document.fileName.replace(/(\.[^.]*)$/, "");
      this._commandUris.pdf = vscode.Uri.file(`${filename}.pdf`);
      this._commandUris.html = vscode.Uri.file(`${filename}.html`);
      this._commandUris.csv = vscode.Uri.file(`${filename}.csv`);
      this._commandUris.json = vscode.Uri.file(`${filename}.json`);
      const [stat, pdfStat, htmlStat, csvStat, jsonStat] = await Promise.all([
        fileStat(uri),
        fileStat(this._commandUris.pdf),
        fileStat(this._commandUris.html),
        fileStat(this._commandUris.csv),
        fileStat(this._commandUris.json),
      ]);
      this._stat = stat;
      this._commandStats[this._commandUris.pdf.path] = pdfStat;
      this._commandStats[this._commandUris.html.path] = htmlStat;
      this._commandStats[this._commandUris.csv.path] = csvStat;
      this._commandStats[this._commandUris.json.path] = jsonStat;
    }
    this.onDidChangeFileDecorationsEmitter.fire(uri);
  }
}
