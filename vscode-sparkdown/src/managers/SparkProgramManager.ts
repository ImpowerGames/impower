import {
  CompileProgramMessage,
  CompileProgramParams,
} from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import * as vscode from "vscode";
import {
  CancellationToken,
  LanguageClient,
} from "vscode-languageclient/browser";

/**
 * Notified when a script's program has been recompiled. With slim
 * notifications the program itself is not pushed, so `program` may be
 * undefined -- consumers that need it should pull via `getOrCompile()`.
 */
type ProgramCompiledListener = (
  uri: vscode.Uri,
  program: SparkProgram | undefined,
) => void;

/** The projection relayed by slim `compiler/didCompile` notifications. */
export interface SlimProgram {
  uri: string;
  scripts: SparkProgram["scripts"];
  files?: SparkProgram["files"];
  version?: number;
}

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
    for (const scriptUri of Object.keys(program.scripts)) {
      this._compiledPrograms.set(scriptUri, program);
      this._compiledUris.add(vscode.Uri.parse(scriptUri));
      this._listeners.forEach((listener) =>
        listener(vscode.Uri.parse(scriptUri), program),
      );
    }
    this.updateResourceContexts();
  }

  /**
   * Handle a slim `compiler/didCompile` notification: the full program was
   * NOT pushed (that clone cost ~9MB per keystroke on a large project), so
   * drop any cached full program for the affected scripts and let consumers
   * pull a fresh one on demand via `getOrCompile()`.
   */
  updateSlim(uri: vscode.Uri, program: SlimProgram) {
    this._lastCompiledUri = uri.toString();
    for (const scriptUri of Object.keys(program.scripts)) {
      this._compiledPrograms.delete(scriptUri);
      this._compiledUris.add(vscode.Uri.parse(scriptUri));
      this._listeners.forEach((listener) =>
        listener(vscode.Uri.parse(scriptUri), undefined),
      );
    }
    this.updateResourceContexts();
  }

  protected updateResourceContexts() {
    const resources = Array.from(
      this._compiledUris.keys().map((uri) => uri.toString()),
    );
    vscode.commands.executeCommand(
      "setContext",
      `sparkdown.program`,
      resources,
    );
    vscode.commands.executeCommand(
      "setContext",
      `sparkdown.json`,
      resources.map((uri) => uri.replace(/.sd$/, ".json")),
    );
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
    const program = await client.sendRequest<SparkProgram>(
      CompileProgramMessage.method,
      params,
      CancellationToken.None,
    );
    if (program?.scripts) {
      // Cache the pulled program so bursts of readers don't re-request it;
      // the next slim didCompile invalidates these entries.
      for (const scriptUri of Object.keys(program.scripts)) {
        this._compiledPrograms.set(scriptUri, program);
      }
    }
    return program;
  }
}
