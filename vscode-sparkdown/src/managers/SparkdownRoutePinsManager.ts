import type { ChangeRoutePinsParams } from "@impower/spark-editor-protocol/src/protocols/preview/ChangeRoutePinsMessage";
import type { RoutePin } from "@impower/spark-editor-protocol/src/protocols/preview/SetRoutePinsMessage";
import {
  changedRoutePins,
  type RoutePinsByScript,
} from "@impower/spark-editor-protocol/src/utils/changedRoutePins";
import * as vscode from "vscode";
import {
  allRoutePins,
  mapRoutePinMarks,
  routePinMarks,
  routePinsOfMarks,
  type DocumentLines,
  type RoutePinMark,
} from "../utils/routePins";

const ROUTE_PINS_STATE_KEY = "sparkdown.gamePreview.routePins";

const documentLines = (document: vscode.TextDocument): DocumentLines => ({
  lineCount: document.lineCount,
  lineSpan: (line) => {
    const range = document.lineAt(line).range;
    return {
      lineStart: document.offsetAt(range.start),
      lineEnd: document.offsetAt(range.end),
    };
  },
  lineAt: (offset) => document.positionAt(offset).line,
});

export class SparkdownRoutePinsManager {
  private static _instance: SparkdownRoutePinsManager;
  static get instance(): SparkdownRoutePinsManager {
    if (!this._instance) {
      this._instance = new SparkdownRoutePinsManager();
    }
    return this._instance;
  }

  protected _workspaceState?: vscode.Memento;

  protected _marksOfOpenDocuments = new Map<string, RoutePinMark[]>();

  protected _onDidChangePins = new vscode.EventEmitter<RoutePin[]>();
  readonly onDidChangePins = this._onDidChangePins.event;

  activate(context: vscode.ExtensionContext) {
    this._workspaceState = context.workspaceState;
    for (const document of vscode.workspace.textDocuments) {
      this.markOpenDocument(document);
    }
    context.subscriptions.push(
      this._onDidChangePins,
      vscode.workspace.onDidOpenTextDocument((document) =>
        this.markOpenDocument(document),
      ),
      vscode.workspace.onDidCloseTextDocument((document) =>
        this._marksOfOpenDocuments.delete(document.uri.toString()),
      ),
    );
  }

  get byScript(): RoutePinsByScript {
    return (
      this._workspaceState?.get<RoutePinsByScript>(ROUTE_PINS_STATE_KEY) ?? {}
    );
  }

  get pins(): RoutePin[] {
    return allRoutePins(this.byScript);
  }

  async change(change: ChangeRoutePinsParams): Promise<RoutePin[]> {
    const byScript = changedRoutePins(this.byScript, change);
    const saved = this.store(byScript);
    for (const document of vscode.workspace.textDocuments) {
      this.markOpenDocument(document, byScript);
    }
    await saved;
    return this.pins;
  }

  protected async store(byScript: RoutePinsByScript) {
    if (!this._workspaceState) {
      throw new Error("Pins are not kept before the extension activates");
    }
    await this._workspaceState.update(ROUTE_PINS_STATE_KEY, byScript);
    this._onDidChangePins.fire(this.pins);
  }

  protected markOpenDocument(
    document: vscode.TextDocument,
    byScript = this.byScript,
  ) {
    const uri = document.uri.toString();
    const pins = byScript[uri];
    if (pins) {
      this._marksOfOpenDocuments.set(
        uri,
        routePinMarks(documentLines(document), pins),
      );
    } else {
      this._marksOfOpenDocuments.delete(uri);
    }
  }

  moveThroughEdit(change: vscode.TextDocumentChangeEvent) {
    const uri = change.document.uri.toString();
    const marks = this._marksOfOpenDocuments.get(uri);
    if (!marks || change.contentChanges.length === 0) {
      return;
    }
    const lines = documentLines(change.document);
    const moved = mapRoutePinMarks(marks, change.contentChanges, lines);
    this._marksOfOpenDocuments.set(uri, moved);
    const pins = routePinsOfMarks(moved, lines);
    if (JSON.stringify(pins) === JSON.stringify(this.byScript[uri])) {
      return;
    }
    const byScript = { ...this.byScript };
    if (pins.length > 0) {
      byScript[uri] = pins;
    } else {
      delete byScript[uri];
    }
    this.store(byScript).catch(console.error);
  }
}
