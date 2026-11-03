import {
  changeStartingValues,
  movePlaceLines,
  placeLinesOf,
  startingValuesFrom,
  type StartingValues,
} from "@impower/sparkdown/src/program/startingValueLiterals";
import * as vscode from "vscode";
import { documentLines } from "../utils/documentLines";
import { mapLineSpan, type LineSpan } from "../utils/routePins";

const STARTING_VALUES_STATE_KEY = "sparkdown.gamePreview.startingValues";

interface PlaceLineMark {
  line: number;
  span: LineSpan;
}

export class SparkdownStartingValuesManager {
  private static _instance: SparkdownStartingValuesManager;
  static get instance(): SparkdownStartingValuesManager {
    if (!this._instance) {
      this._instance = new SparkdownStartingValuesManager();
    }
    return this._instance;
  }

  protected _workspaceState?: vscode.Memento;

  protected _marksOfOpenDocuments = new Map<string, PlaceLineMark[]>();

  protected _onDidChangeValues = new vscode.EventEmitter<StartingValues>();
  readonly onDidChangeValues = this._onDidChangeValues.event;

  activate(context: vscode.ExtensionContext) {
    this._workspaceState = context.workspaceState;
    for (const document of vscode.workspace.textDocuments) {
      this.markOpenDocument(document);
    }
    context.subscriptions.push(
      this._onDidChangeValues,
      vscode.workspace.onDidOpenTextDocument((document) =>
        this.markOpenDocument(document),
      ),
      vscode.workspace.onDidCloseTextDocument((document) =>
        this._marksOfOpenDocuments.delete(document.uri.toString()),
      ),
    );
  }

  get values(): StartingValues {
    return startingValuesFrom(
      this._workspaceState?.get(STARTING_VALUES_STATE_KEY),
    );
  }

  async change(start: string, changes: Record<string, string | null>) {
    const values = changeStartingValues(this.values, start, changes);
    const saved = this.store(values);
    for (const document of vscode.workspace.textDocuments) {
      this.markOpenDocument(document, values);
    }
    await saved;
  }

  protected async store(values: StartingValues) {
    if (!this._workspaceState) {
      throw new Error(
        "Starting values are not kept before the extension activates",
      );
    }
    await this._workspaceState.update(STARTING_VALUES_STATE_KEY, values);
    this._onDidChangeValues.fire(this.values);
  }

  protected markOpenDocument(
    document: vscode.TextDocument,
    values = this.values,
  ) {
    const uri = document.uri.toString();
    const lines = documentLines(document);
    const marks = placeLinesOf(values, uri)
      .filter((line) => line < lines.lineCount)
      .map((line) => ({ line, span: lines.lineSpan(line) }));
    if (marks.length > 0) {
      this._marksOfOpenDocuments.set(uri, marks);
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
    const moves = new Map<number, number | null>();
    const moved: PlaceLineMark[] = [];
    for (const mark of marks) {
      const span = mapLineSpan(mark.span, change.contentChanges, lines);
      const line = span ? lines.lineAt(span.lineStart) : null;
      moves.set(mark.line, line);
      if (span && line !== null) {
        moved.push({ line, span });
      }
    }
    this._marksOfOpenDocuments.set(uri, moved);
    const values = this.values;
    const next = movePlaceLines(values, uri, moves);
    if (next !== values) {
      this.store(next).catch(console.error);
    }
  }
}
