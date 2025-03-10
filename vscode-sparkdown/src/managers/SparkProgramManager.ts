import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import * as vscode from "vscode";

export class SparkProgramManager {
  private static _instance: SparkProgramManager;
  static get instance(): SparkProgramManager {
    if (!this._instance) {
      this._instance = new SparkProgramManager();
    }
    return this._instance;
  }

  protected _lastParsedUri?: string;

  protected _parsedPrograms = new Map<string, SparkProgram>();

  protected _parsedUris = new Set<vscode.Uri>();

  update(uri: vscode.Uri, program: SparkProgram) {
    this._lastParsedUri = uri.toString();
    this._parsedUris.add(uri);
    this._parsedPrograms.set(uri.toString(), program);
    const resources = Array.from(
      this._parsedUris.keys().map((uri) => uri.toString())
    );
    vscode.commands.executeCommand(
      "setContext",
      `sparkdown.program`,
      resources
    );
    vscode.commands.executeCommand(
      "setContext",
      `sparkdown.json`,
      resources.map((uri) => uri.replace(/.sd$/, ".json"))
    );
  }

  all() {
    return Array.from(this._parsedPrograms.values());
  }

  get(uri: vscode.Uri) {
    return this._parsedPrograms.get(uri.toString());
  }

  getLastParsed() {
    if (this._lastParsedUri) {
      return this._parsedPrograms.get(this._lastParsedUri);
    }
    return undefined;
  }
}
