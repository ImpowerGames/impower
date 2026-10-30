import {
  CompileProgramMessage,
  CompileProgramParams,
} from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import type {
  AddressQuery,
  ProgramAddress,
  SourceLocation,
} from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { playRefusalOf } from "@impower/sparkdown/src/compiler/utils/startScene";
import * as vscode from "vscode";
import {
  CancellationToken,
  LanguageClient,
} from "vscode-languageclient/browser";

type ProgramCompiledListener = (
  uri: vscode.Uri,
  program: SparkProgram | undefined,
) => void;

export interface SlimProgram {
  uri: string;
  scripts: SparkProgram["scripts"];
  files?: SparkProgram["files"];
  version?: number;
  playRefusal?: string;
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

  protected _playRefusals = new Map<string, string | undefined>();

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
      this._playRefusals.set(scriptUri, playRefusalOf(program));
      this._compiledUris.add(vscode.Uri.parse(scriptUri));
      this._listeners.forEach((listener) =>
        listener(vscode.Uri.parse(scriptUri), program),
      );
    }
    this.updateResourceContexts();
  }

  updateSlim(uri: vscode.Uri, program: SlimProgram) {
    this._lastCompiledUri = uri.toString();
    for (const scriptUri of Object.keys(program.scripts)) {
      this._compiledPrograms.delete(scriptUri);
      this._playRefusals.set(scriptUri, program.playRefusal);
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

  playRefusal(uri: vscode.Uri) {
    return this._playRefusals.get(uri.toString());
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

  async addressAt(
    uri: vscode.Uri,
    line: number,
    query?: AddressQuery,
  ): Promise<ProgramAddress | undefined> {
    const client = await this.languageClientReady;
    const address = await client.sendRequest<ProgramAddress | null>(
      "sparkdown/addressAt",
      { uri: uri.toString(), line, query },
      CancellationToken.None,
    );
    return address ?? undefined;
  }

  async locationOf(
    uri: vscode.Uri,
    address: ProgramAddress,
  ): Promise<SourceLocation | undefined> {
    const client = await this.languageClientReady;
    const location = await client.sendRequest<SourceLocation | null>(
      "sparkdown/locationOf",
      { uri: uri.toString(), address },
      CancellationToken.None,
    );
    return location ?? undefined;
  }

  async compile(uri: vscode.Uri) {
    const client = await this.languageClientReady;
    const params: CompileProgramParams = {
      textDocument: { uri: uri.toString() },
    };
    const program = await client.sendRequest<SparkProgram>(
      CompileProgramMessage.method,
      params,
      CancellationToken.None,
    );
    if (program?.scripts) {
      for (const scriptUri of Object.keys(program.scripts)) {
        this._compiledPrograms.set(scriptUri, program);
        this._playRefusals.set(scriptUri, playRefusalOf(program));
      }
    }
    return program;
  }
}
