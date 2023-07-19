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

  protected _parsed: Record<string, SparkProgram> = {};

  update(uri: vscode.Uri, program: SparkProgram) {
    this._lastParsedUri = uri.toString();
    this._parsed[uri.toString()] = program;
  }

  get(uri: vscode.Uri) {
    return this._parsed[uri.toString()];
  }

  getLastParsed() {
    if (this._lastParsedUri) {
      return this._parsed[this._lastParsedUri];
    }
    return undefined;
  }
}
