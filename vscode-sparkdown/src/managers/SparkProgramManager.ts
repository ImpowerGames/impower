import {
  CompileProgramMessage,
  CompileProgramParams,
} from "@impower/spark-editor-protocol/src/protocols/compiler/CompileProgramMessage";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import * as vscode from "vscode";
import {
  CancellationToken,
  LanguageClient,
} from "vscode-languageclient/browser";

type ProgramCompiledListener = (uri: vscode.Uri, program: SparkProgram) => void;

export class SparkProgramManager {
  private static _instance: SparkProgramManager;
  static get instance(): SparkProgramManager {
    if (!this._instance) {
      this._instance = new SparkProgramManager();
    }
    return this._instance;
  }

  constructor() {
    this._languageClientReady = new Promise<LanguageClient>((resolve) => {
      this._resolveLanguageClientReady = resolve;
    });
    if (this._languageClient) {
      this._resolveLanguageClientReady(this._languageClient);
    }
  }

  protected _lastCompiledUri?: string;

  protected _compiledPrograms = new Map<string, SparkProgram>();

  protected _compiledUris = new Set<vscode.Uri>();

  private _listeners = new Set<ProgramCompiledListener>();

  protected _languageClient?: LanguageClient;

  private _languageClientReady: Promise<LanguageClient>;

  get languageClientReady(): Promise<LanguageClient> {
    return this._languageClientReady;
  }

  private _resolveLanguageClientReady!: (client: LanguageClient) => void;

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

  async getOrCompile(uri: vscode.Uri) {
    const program = this._compiledPrograms.get(uri.toString());
    if (program) {
      return program;
    }
    return await this.compile(uri);
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

  bindLanguageClient(languageClient: LanguageClient) {
    this._languageClient = languageClient;
    this._resolveLanguageClientReady(languageClient);
  }

  async compile(uri: vscode.Uri) {
    const client = await this.languageClientReady;
    const params: CompileProgramParams = { uri: uri.toString() };
    return client.sendRequest<SparkProgram>(
      CompileProgramMessage.method,
      params,
      CancellationToken.None
    );
  }
}
