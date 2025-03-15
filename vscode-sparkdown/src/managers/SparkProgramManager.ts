import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import * as vscode from "vscode";

type ProgramCompiledListener = (uri: vscode.Uri, program: SparkProgram) => void;

export class SparkProgramManager {
  private static _instance: SparkProgramManager;
  static get instance(): SparkProgramManager {
    if (!this._instance) {
      this._instance = new SparkProgramManager();
    }
    return this._instance;
  }

  protected _lastCompiledUri?: string;

  protected _compiledPrograms = new Map<string, SparkProgram>();

  protected _compiledUris = new Set<vscode.Uri>();

  private _listeners = new Set<ProgramCompiledListener>();

  update(uri: vscode.Uri, program: SparkProgram) {
    this._lastCompiledUri = uri.toString();
    this._compiledUris.add(uri);
    this._compiledPrograms.set(uri.toString(), program);
    const resources = Array.from(
      this._compiledUris.keys().map((uri) => uri.toString())
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
    this._listeners.forEach((listener) => listener(uri, program));
  }

  all() {
    return Array.from(this._compiledPrograms.values());
  }

  get(uri: vscode.Uri) {
    return this._compiledPrograms.get(uri.toString());
  }

  getLastCompiled() {
    if (this._lastCompiledUri) {
      return this._compiledPrograms.get(this._lastCompiledUri);
    }
    return undefined;
  }

  addListener(listener: ProgramCompiledListener) {
    this._listeners.add(listener);
  }

  removeListener(listener: ProgramCompiledListener) {
    this._listeners.delete(listener);
  }
}
