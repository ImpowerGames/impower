import {
  RuntimeDiagnosticsMessage,
  type RuntimeDiagnosticsParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/RuntimeDiagnosticsMessage";
import {
  CompileProgramMessage,
  CompileProgramParams,
} from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import {
  SparkdownDocumentContentChangeEvent,
  SparkdownDocumentRegistry,
} from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { isLuauFile } from "@impower/sparkdown/src/compiler/typecheck/LuauUnitNodes";
import { buildSVGSource } from "@impower/sparkdown/src/compiler/utils/buildSVGSource";
import { getContextEntry } from "@impower/sparkdown/src/compiler/utils/getContextEntry";
import {
  hasLuauExtension,
  projectLuauFiles,
} from "@impower/sparkdown/src/compiler/utils/projectMembership";
import {
  findRunName,
  findRunPath,
} from "@impower/sparkdown/src/compiler/utils/runOperand";
import { decodeSVGSource } from "@impower/sparkdown/src/attributes";
import { morphRefsForStruct } from "@impower/sparkdown/src/morph/channel";
import { createMorphHost, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphBakeDiagnostic, MorphRef } from "@impower/sparkdown/src/morph/types";
import COMPILER_INLINE_WORKER_STRING from "@impower/sparkdown/src/worker/sparkdown.worker";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import { getDiagnosticActions } from "../utils/providers/getCodeActions";
import { diffDirtyRange } from "../utils/providers/getFormatDirtyRange";
import {
  type Connection,
  Disposable,
  type DocumentDiagnosticParams,
  type DocumentDiagnosticReport,
  DocumentDiagnosticRequest,
  ErrorCodes,
  ExecuteCommandRequest,
  FileChangeType,
  FoldingRangeRefreshRequest,
  PublishDiagnosticsNotification,
  ResponseError,
  SemanticTokensRefreshRequest,
  TextDocumentSyncKind,
} from "vscode-languageserver";

export const LUAU_DOCUMENT_OWNER = "luau-document";

const LUAU_DOCUMENT_DELAY = 300;

export class SparkdownLanguageServerWorkspace extends SparkdownWorkspace {
  protected _documents: SparkdownDocumentRegistry;

  protected _workspaceFolders?: { uri: string; name: string }[];
  get workspaceFolders() {
    return this._workspaceFolders;
  }

  _connection: Connection;

  constructor(connection: Connection, profilerId?: string) {
    super(COMPILER_INLINE_WORKER_STRING, profilerId);
    this._documents = new SparkdownDocumentRegistry([
      "characters",
      "colors",
      "declarations",
      "formatting",
      "links",
      "lenses",
      "references",
      "semantics",
    ]);
    this._documents.profilerId = profilerId;
    this._connection = connection;
  }

  loadDocuments(config: {
    files: {
      uri: string;
      name: string;
      ext: string;
      type: string;
      text?: string;
    }[];
  }) {
    if (config.files) {
      for (const file of config.files) {
        file.name = this.getFileName(file.uri);
        file.ext = this.getFileExtension(file.uri);
        file.type = this.getFileType(file.uri);
        if (file.type === "script" && !hasLuauExtension(file.uri)) {
          this._documents.add({
            textDocument: {
              uri: file.uri,
              languageId: "sparkdown",
              version: 0,
              text: file.text || "",
            },
          });
        }
      }
    }
  }

  loadWorkspaceFolders(workspaceFolders: { uri: string; name: string }[]) {
    this._workspaceFolders = workspaceFolders;
  }

  runLuauFiles(uri: string): string[] {
    return projectLuauFiles(
      this.getMainScriptUri(uri) ?? uri,
      this._watchedFiles.keys(),
      (script) => this._watchedFiles.has(script),
      this.mainScriptFilename,
      this.compilerConfig?.uriPathsAsWritten,
    );
  }

  resolveRun(uri: string, operand: string): string | undefined {
    const text = operand.trim();
    const quoted = /^(["']).*\1$/.test(text) && text.length > 1;
    const written = quoted ? text.slice(1, -1) : text;
    const path = written.endsWith(".luau") ? written.slice(0, -".luau".length) : written;
    if (!path.trim()) {
      return undefined;
    }
    if (quoted) {
      return findRunPath(
        uri,
        `${path}.luau`,
        [...this._watchedFiles.keys()].filter(hasLuauExtension),
        this.compilerConfig?.uriPathsAsWritten,
      );
    }
    if (path.includes("/")) {
      return undefined;
    }
    const { matches } = findRunName(
      path,
      this.runLuauFiles(uri),
      this.compilerConfig?.uriPathsAsWritten,
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  uris() {
    return this._documents.keys();
  }

  document(uri: string) {
    return this._documents.get(uri);
  }

  tree(uri: string) {
    return this._documents.tree(uri);
  }

  annotations(uri: string) {
    return this._documents.annotations(uri);
  }

  protected _lastFormattedText = new Map<string, string>();

  formatDirtyRange(
    uri: string,
    currentText: string,
  ): { from: number; to: number } | undefined {
    const baseline = this._lastFormattedText.get(uri);
    if (baseline == null) {
      return undefined;
    }
    return diffDirtyRange(baseline, currentText) ?? { from: 0, to: 0 };
  }

  markFormatted(uri: string, formattedText: string) {
    this._lastFormattedText.set(uri, formattedText);
  }

  clearFormatCache(uri: string) {
    this._lastFormattedText.delete(uri);
  }

  override async sendNotification<P, M extends string>(
    method: M,
    params: P,
  ): Promise<void> {
    this._connection?.sendNotification(method, params);
  }

  override async sendRequest<P, M extends string, R>(
    method: M,
    params: P,
  ): Promise<R> {
    return this._connection?.sendRequest(method, params);
  }

  override async getFileText(uri: string): Promise<string> {
    return this._connection.sendRequest(ExecuteCommandRequest.type, {
      command: "sparkdown.getFileText",
      arguments: [uri],
    });
  }

  override async getFileSrc(uri: string): Promise<string> {
    return this._connection?.sendRequest(ExecuteCommandRequest.type, {
      command: "sparkdown.getFileSrc",
      arguments: [uri],
    });
  }

  override async getFileBytes(uri: string): Promise<string | undefined> {
    return this._connection?.sendRequest(ExecuteCommandRequest.type, {
      command: "sparkdown.getFileBytes",
      arguments: [uri],
    });
  }

  override async getFileVersion(uri: string): Promise<number> {
    return this._connection?.sendRequest(ExecuteCommandRequest.type, {
      command: "sparkdown.getFileVersion",
      arguments: [uri],
    });
  }

  override async getFileLanguageId(uri: string): Promise<string> {
    return this._connection?.sendRequest(ExecuteCommandRequest.type, {
      command: "sparkdown.getFileLanguageId",
      arguments: [uri],
    });
  }

  override async initialize(
    params: Parameters<SparkdownWorkspace["initialize"]>[0],
  ) {
    const result = await super.initialize(params);
    this.scheduleBackgroundParses();
    return result;
  }

  protected scheduleBackgroundParses() {
    const uris = Array.from(this._documents.keys()).sort(
      (a, b) =>
        (this._documents.get(a)?.length ?? 0) -
        (this._documents.get(b)?.length ?? 0),
    );
    let i = 0;
    const step = () => {
      if (i >= uris.length) {
        return;
      }
      const uri = uris[i++]!;
      try {
        if (this._documents.has(uri)) {
          this._documents.tree(uri);
        }
      } catch (e) {
        console.error("background parse failed", uri, e);
      }
      setTimeout(step, 50);
    };
    setTimeout(step, 500);
  }

  override async onOpenTextDocument(params: {
    textDocument: {
      uri: string;
      languageId: string;
      version: number;
      text: string;
    };
  }) {
    this._documents.add(params);
    this.scheduleLuauDocument(params.textDocument.uri);
  }

  override async onChangeTextDocument(params: {
    textDocument: {
      uri: string;
      version: number;
    };
    contentChanges: SparkdownDocumentContentChangeEvent[];
  }) {
    this._documents.update(params);
    this.scheduleLuauDocument(params.textDocument.uri);
  }

  override onCloseTextDocument(params: { textDocument: { uri: string } }) {
    const uri = params.textDocument.uri;
    if (!isLuauFile(uri)) {
      return;
    }
    clearTimeout(this._luauDocumentCompiles.get(uri));
    this._luauDocumentCompiles.delete(uri);
    if (this._lastPublishedDiagnostics.get(uri)?.owner === LUAU_DOCUMENT_OWNER) {
      this._lastPublishedDiagnostics.delete(uri);
      this.sendNotification(PublishDiagnosticsNotification.method, {
        uri,
        diagnostics: [],
      });
    }
  }

  protected _luauDocumentCompiles = new Map<string, ReturnType<typeof setTimeout>>();

  protected scheduleLuauDocument(uri: string) {
    if (!isLuauFile(uri)) {
      return;
    }
    clearTimeout(this._luauDocumentCompiles.get(uri));
    this._luauDocumentCompiles.set(
      uri,
      setTimeout(() => {
        this._luauDocumentCompiles.delete(uri);
        this.publishLuauDocument(uri).catch((e) => console.error(e));
      }, LUAU_DOCUMENT_DELAY),
    );
  }

  async publishLuauDocument(uri: string) {
    await this.compilerReady();
    await this._documentUpdatesPosted;
    const result = await this._compilerChannelConnection.sendRequest(
      CompileProgramMessage.type,
      { textDocument: { uri } },
    );
    if (!result.program?.summary) {
      this._programTransport.decode(result.program);
    }
    if (!this.textDocumentIsOpen(uri)) {
      return;
    }
    this.publishDiagnostics(
      uri,
      this.getDiagnostics(result.program, uri),
      LUAU_DOCUMENT_OWNER,
    );
  }

  protected _lastPublishedDiagnostics = new Map<
    string,
    {
      fingerprint: string;
      version: number | undefined;
      diagnostics: ReturnType<SparkdownWorkspace["getDiagnostics"]>;
      owner: string | undefined;
    }
  >();

  // workaround(vscode): the hover and completion markdown sanitizer loads only http(s) and data: image srcs, so filtered SVG previews stay data URIs
  protected attachLazyImageData(program: {
    context?: { image?: Record<string, any> };
  }): void {
    const images = program?.context?.image;
    if (!images) {
      return;
    }
    for (const image of Object.values(images)) {
      if (
        !image ||
        typeof image !== "object" ||
        "data" in image ||
        image.ext !== "svg" ||
        typeof image.uri !== "string"
      ) {
        continue;
      }
      Object.defineProperty(image, "data", {
        configurable: true,
        enumerable: true,
        get: () => {
          const file = this._watchedFiles.get(image.uri);
          const value = file?.data ?? (file?.text ? buildSVGSource(file.text) : undefined);
          Object.defineProperty(image, "data", {
            configurable: true,
            enumerable: true,
            writable: true,
            value,
          });
          return value;
        },
      });
    }
  }

  protected _morphService?: MorphBakeService;
  protected _morphDiagnostics?: Map<string, MorphBakeDiagnostic[]>;
  protected static readonly MORPH_DIAGNOSTIC_KEYS = 512;
  protected static readonly MORPH_PREVIEW_WAIT_MS = 1500;

  protected get morphService() {
    return (this._morphService ??= new MorphBakeService());
  }

  protected get morphDiagnostics() {
    return (this._morphDiagnostics ??= new Map());
  }

  protected morphHost(program: SparkProgram): MorphHost {
    return createMorphHost({
      service: this.morphService,
      channel: () => program.morphs,
      readSource: async (ref) => {
        const image = getContextEntry(program.context, "image", ref.image);
        const uri = typeof image?.uri === "string" ? image.uri : undefined;
        const file = uri ? this._watchedFiles.get(uri) : undefined;
        const text =
          file?.text ||
          (file?.data ? decodeSVGSource(file.data) : undefined) ||
          (typeof image?.data === "string" && image.data ? decodeSVGSource(image.data) : undefined);
        return text ? { text, ...(uri ? { uri } : {}) } : undefined;
      },
    });
  }

  protected morphRefs(program: SparkProgram): { variant: string; ref: MorphRef; uri?: string }[] {
    const refs: { variant: string; ref: MorphRef; uri?: string }[] = [];
    for (const [variant, list] of Object.entries(program.morphs?.variants ?? {})) {
      for (const ref of list) {
        const uri = getContextEntry(program.context, "image", ref.image)?.uri;
        refs.push({ variant, ref, ...(typeof uri === "string" ? { uri } : {}) });
      }
    }
    return refs;
  }

  protected recordMorphDiagnostics(key: string, diagnostics: MorphBakeDiagnostic[]) {
    this.morphDiagnostics.delete(key);
    this.morphDiagnostics.set(key, diagnostics);
    const limit = SparkdownLanguageServerWorkspace.MORPH_DIAGNOSTIC_KEYS;
    while (this.morphDiagnostics.size > limit) {
      this.morphDiagnostics.delete(this.morphDiagnostics.keys().next().value!);
    }
  }

  protected morphDiagnosticsFor(program: SparkProgram, uri: string) {
    type Group = { diagnostic: MorphBakeDiagnostic; variants: string[] };
    const grouped = new Map<string, Group>();
    for (const { variant, ref, uri: artwork } of this.morphRefs(program)) {
      if (artwork !== uri) continue;
      for (const d of this.morphDiagnostics.get(ref.key) ?? []) {
        const key = JSON.stringify([d.morph, d.code, d.severity, d.layer, d.message]);
        const group: Group = grouped.get(key) ?? { diagnostic: d, variants: [] };
        if (!group.variants.includes(variant)) group.variants.push(variant);
        grouped.set(key, group);
      }
    }
    const out: ReturnType<SparkdownWorkspace["getDiagnostics"]> = [];
    for (const { diagnostic: d, variants } of grouped.values()) {
      const shown = variants.slice(0, 3).map((v) => `\`${v}\``).join(", ");
      const more = variants.length > 3 ? ` and ${variants.length - 3} more` : "";
      const where = d.layer ? ` (layer "${d.layer}")` : "";
      out.push({
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        severity: d.severity === "error" ? 1 : 2,
        code: `morph-${d.code}`,
        source: "sparkdown",
        message: `Morph \`${d.morph}\` on ${shown}${more}${where}: ${d.message}`,
      });
    }
    return out;
  }

  protected bakeProgramMorphs(program: SparkProgram, owner: string | undefined) {
    const consumers = this.morphRefs(program);
    const pending = new Map<string, { variant: string; ref: MorphRef }>();
    for (const { variant, ref } of consumers) {
      if (!this.morphDiagnostics.has(ref.key) && !pending.has(ref.key)) pending.set(ref.key, { variant, ref });
    }
    if (pending.size === 0) return;
    const host = this.morphHost(program);
    void Promise.allSettled(
      [...pending.values()].map(({ variant, ref }) =>
        host.resolve(ref).then(
          (handle) => {
            this.recordMorphDiagnostics(ref.key, handle.artifact.diagnostics);
            handle.release();
          },
          (error) => {
            this.recordMorphDiagnostics(ref.key, [
              {
                code: "source-unreadable",
                severity: "warning",
                message: `It could not be baked: ${error instanceof Error ? error.message : String(error)}`,
                morph: ref.morph,
                variant,
              },
            ]);
          },
        ),
      ),
    ).then(() => {
      if (owner && this._entryPrograms.get(owner) !== program) return;
      const uris = new Set(
        consumers.filter(({ ref, uri }) => uri && pending.has(ref.key)).map(({ uri }) => uri!),
      );
      for (const uri of uris) this.publishDiagnostics(uri, this.getDiagnostics(program, uri), owner);
    });
  }

  async morphRestRender(context: SparkProgram["context"], struct: any): Promise<string | undefined> {
    if (!context) return undefined;
    const program = [...this._entryPrograms.values()].find(
      (p) => p.context === context || (!!p.context?.["image"] && p.context["image"] === context["image"]),
    );
    const ref = program ? morphRefsForStruct(context, program.morphs, struct)[0] : undefined;
    if (!program || !ref) return undefined;
    const wait = new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), SparkdownLanguageServerWorkspace.MORPH_PREVIEW_WAIT_MS),
    );
    const resolved = this.morphHost(program)
      .resolve(ref)
      .then((handle) => {
        const rest = handle.artifact.status === "live" ? handle.artifact.rest : undefined;
        handle.release();
        return rest;
      })
      .catch(() => undefined);
    return Promise.race([resolved, wait]);
  }

  protected publishDiagnostics(
    uri: string,
    diagnostics: ReturnType<SparkdownWorkspace["getDiagnostics"]>,
    owner: string | undefined,
  ) {
    const last = this._lastPublishedDiagnostics.get(uri);
    if (
      last?.owner === LUAU_DOCUMENT_OWNER &&
      owner !== LUAU_DOCUMENT_OWNER &&
      this.textDocumentIsOpen(uri)
    ) {
      return;
    }
    const version = this._documentVersions.get(uri);
    const fingerprint = JSON.stringify(diagnostics);
    this._lastPublishedDiagnostics.set(uri, { fingerprint, version, diagnostics, owner });
    if (last && last.fingerprint === fingerprint && last.version === version) {
      return;
    }
    this.sendNotification(PublishDiagnosticsNotification.method, {
      uri,
      diagnostics,
      version,
    });
  }

  protected _runtimeDiagnostics?: {
    params: RuntimeDiagnosticsParams;
    files: number;
  };

  protected _fileChanges = 0;

  reportRuntimeDiagnostics(params: RuntimeDiagnosticsParams) {
    const last = this._runtimeDiagnostics?.params;
    const uris = new Set([
      ...Object.keys(last?.diagnostics ?? {}),
      ...Object.keys(params.diagnostics ?? {}),
    ]);
    this._runtimeDiagnostics = { params, files: this._fileChanges };
    for (const uri of uris) {
      const published = this._lastPublishedDiagnostics.get(uri)?.owner;
      const owner = published === LUAU_DOCUMENT_OWNER ? undefined : published;
      const entryUri = [
        params.program.uri,
        owner,
        last?.program.uri,
        this.getMainScriptUri(uri),
        uri,
      ].find((candidate) => candidate && this.compiledProgram(candidate));
      const program = entryUri ? this.compiledProgram(entryUri) : undefined;
      if (!program || !entryUri) {
        continue;
      }
      this.publishDiagnostics(
        uri,
        this.getDiagnostics(program, uri),
        owner ?? program.uri ?? entryUri,
      );
    }
  }

  protected _entryPrograms = new Map<string, SparkProgram>();

  protected compiledProgram(uri: string): SparkProgram | undefined {
    return this._entryPrograms.get(uri);
  }

  protected ranProgram(
    ran: { params: RuntimeDiagnosticsParams; files: number },
    program: SparkProgram,
  ) {
    if (ran.files !== this._fileChanges) {
      return false;
    }
    const { uri, scripts: ranScripts = {} } = ran.params.program;
    if (program.uri && uri && program.uri !== uri) {
      return false;
    }
    const scripts = program.scripts ?? {};
    const names = Object.keys(ranScripts);
    return (
      names.length > 0 &&
      names.length === Object.keys(scripts).length &&
      names.every((name) => scripts[name] === ranScripts[name])
    );
  }

  protected withDiagnosticActions<
    T extends ReturnType<SparkdownWorkspace["getDiagnostics"]>[number],
  >(diagnostics: T[], uri: string): T[] {
    const document = this.document(uri);
    if (!document || this.clientCapabilities?.textDocument?.codeAction) {
      return diagnostics;
    }
    return diagnostics.map((diagnostic) => {
      const actions = getDiagnosticActions(document, diagnostic);
      if (actions.length > 0) {
        return { ...diagnostic, data: actions };
      }
      const { data: _data, ...rest } = diagnostic;
      return rest as T;
    });
  }

  override getDiagnostics(program: SparkProgram, uri: string) {
    const diagnostics = this.withDiagnosticActions(
      [...super.getDiagnostics(program, uri), ...this.morphDiagnosticsFor(program, uri)],
      uri,
    );
    const report = this._runtimeDiagnostics;
    const reported = report?.params.diagnostics?.[uri];
    const entry = report?.params.program.uri;
    const ran = entry ? this.compiledProgram(entry) : program;
    if (!report || !reported?.length || !ran || !this.ranProgram(report, ran)) {
      return diagnostics;
    }
    const seen = new Set<string>();
    const runtime = reported.filter((d) => {
      const key = JSON.stringify([d.severity, d.message, d.range]);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    return [...diagnostics, ...(runtime as typeof diagnostics)];
  }

  override onCompiledTextDocument(params: {
    textDocument?: { uri: string };
    program: any;
  }): void {
    this.attachLazyImageData(params.program);
    const owner = params.program.uri ?? params.textDocument?.uri;
    if (owner) {
      this._entryPrograms.set(owner, params.program);
    }
    const morphUris = this.morphRefs(params.program)
      .filter(({ ref, uri }) => uri && this.morphDiagnostics.get(ref.key)?.length)
      .map(({ uri }) => uri!);
    const uris = new Set([
      ...this._documentVersions.keys(),
      ...Object.keys(params.program.diagnostics ?? {}),
      ...this._lastPublishedDiagnostics.keys(),
      ...morphUris,
    ]);
    for (const uri of uris) {
      const last = this._lastPublishedDiagnostics.get(uri);
      if (hasLuauExtension(uri) && last?.owner === LUAU_DOCUMENT_OWNER) {
        continue;
      }
      if (
        !this.isScriptDocument(uri) &&
        last &&
        last.owner !== owner &&
        !Object.prototype.hasOwnProperty.call(params.program.diagnostics ?? {}, uri) &&
        !morphUris.includes(uri)
      ) {
        continue;
      }
      this.publishDiagnostics(uri, this.getDiagnostics(params.program, uri), owner);
    }
    this.bakeProgramMorphs(params.program, owner);
    this.requestRefresh(FoldingRangeRefreshRequest.method);
    this.requestRefresh(SemanticTokensRefreshRequest.method);
  }

  protected requestRefresh(method: string) {
    Promise.resolve(this.sendRequest(method, {})).catch(() => {});
  }

  override onCreatedFile(file: {
    uri: string;
    name: string;
    ext: string;
    type: string;
    src?: string;
    text?: string | undefined;
    version?: number | null;
    languageId?: string | null;
  }) {
    this._fileChanges += 1;
    if (
      file &&
      file.type === "script" &&
      !hasLuauExtension(file.uri) &&
      file.version !== undefined &&
      file.languageId !== undefined
    ) {
      this._documents.set(
        {
          textDocument: {
            uri: file.uri,
            text: file.text! || "",
            version: file.version,
            languageId: file.languageId,
          },
        },
        { defer: true },
      );
    }
  }

  override onChangedFile(file: {
    uri: string;
    name: string;
    ext: string;
    type: string;
    src?: string;
    text?: string | undefined;
    version?: number | null;
    languageId?: string | null;
  }) {
    this._fileChanges += 1;
    this._morphService?.invalidate((entry) => entry.uri === file?.uri);
    if (
      file &&
      file.type === "script" &&
      !hasLuauExtension(file.uri) &&
      file.version !== undefined &&
      file.languageId !== undefined
    ) {
      this._documents.set(
        {
          textDocument: {
            uri: file.uri,
            text: file.text! || "",
            version: file.version,
            languageId: file.languageId,
          },
        },
        { defer: true },
      );
    }
  }

  override onDeletedFile(file: {
    uri: string;
    name: string;
    ext: string;
    type: string;
    src?: string;
    text?: string | undefined;
    version?: number | null;
    languageId?: string | null;
  }) {
    this._fileChanges += 1;
    this._morphService?.invalidate((entry) => entry.uri === file.uri);
    this._entryPrograms.delete(file.uri);
    this._documents.remove({ textDocument: { uri: file.uri } });
    this._lastFormattedText.delete(file.uri);
    for (const [uri, published] of this._lastPublishedDiagnostics) {
      if (uri !== file.uri && published.owner !== file.uri) continue;
      this.sendNotification(PublishDiagnosticsNotification.method, {
        uri,
        diagnostics: [],
      });
      this._lastPublishedDiagnostics.delete(uri);
    }
  }

  private isScriptDocument(uri: string): boolean {
    if (hasLuauExtension(uri)) {
      return false;
    }
    return this.getFileType(uri) === "script" ||
      this._documents.get(uri)?.languageId === "sparkdown";
  }

  private getFileDiagnostics(uri: string) {
    if (!this.isScriptDocument(uri)) {
      return this._lastPublishedDiagnostics.get(uri)?.diagnostics ?? [];
    }
    const mainUri = this.getMainScriptUri(uri);
    const program = this.program(mainUri ?? uri);
    return program ? this.getDiagnostics(program, uri) : [];
  }

  async pullDocumentDiagnostics(
    params: DocumentDiagnosticParams,
  ): Promise<DocumentDiagnosticReport> {
    const uri = params.textDocument.uri;
    const document = this._documents.get(uri);
    if (!document || !this.isScriptDocument(uri)) {
      const published = this._lastPublishedDiagnostics.get(uri);
      const publishedVersion =
        published?.owner === LUAU_DOCUMENT_OWNER ? published.version : undefined;
      return {
        kind: "full",
        ...(publishedVersion != null ? { resultId: `${publishedVersion}` } : {}),
        items: this.getFileDiagnostics(uri),
      } as DocumentDiagnosticReport;
    }
    const program = await this.compile(uri, false);
    const resultId = `${document?.version ?? -1}`;
    if (document && program) {
      const items = this.getDiagnostics(program, uri);
      return {
        kind: "full",
        resultId,
        items,
      } as DocumentDiagnosticReport;
    }
    return { kind: "unchanged", resultId };
  }

  override async compile(uri: string, force: boolean): Promise<SparkProgram | undefined> {
    if (hasLuauExtension(uri)) {
      const entries = new Map<string, boolean>();
      const version = this._documentVersions.get(uri);
      for (const state of this._programStates.values()) {
        const read = state.program?.scripts?.[uri];
        if (read !== undefined) {
          entries.set(state.program!.uri, read !== version);
        }
      }
      if (entries.size === 0) {
        const mainUri = this.getMainScriptUri(uri);
        if (mainUri) {
          entries.set(mainUri, false);
        }
      }
      let compiled: SparkProgram | undefined;
      for (const [entry, stale] of entries) {
        compiled = await super.compile(entry, force || stale);
      }
      return compiled;
    }
    if (!this.isScriptDocument(uri)) {
      const mainUri = this.getMainScriptUri(uri);
      return mainUri ? this.program(mainUri) : undefined;
    }
    return super.compile(uri, force);
  }

  public listen(): Disposable {
    (this._connection as any).__textDocumentSync =
      TextDocumentSyncKind.Incremental;
    const disposables: Disposable[] = [];
    disposables.push(
      this._connection.onNotification(
        RuntimeDiagnosticsMessage.method,
        (params: RuntimeDiagnosticsParams) => {
          this.reportRuntimeDiagnostics(params);
        },
      ),
    );
    disposables.push(
      this._connection.onRequest("sparkdown/fileDiagnostics", (params: { uri: string }) => {
        return this.getFileDiagnostics(params.uri);
      }),
    );
    disposables.push(
      this._connection.onRequest(
        DocumentDiagnosticRequest.method,
        (params: DocumentDiagnosticParams) =>
          this.pullDocumentDiagnostics(params),
      ),
    );
    disposables.push(
      this._connection.onRequest(
        CompileProgramMessage.method,
        async (
          params: CompileProgramParams,
        ): Promise<SparkProgram | undefined> => {
          const uri =
            params.textDocument?.uri ?? (params as { uri?: string }).uri;
          if (!uri) {
            return undefined;
          }
          return this.compile(uri, false);
        },
      ),
    );
    disposables.push(
      this._connection.onDidOpenTextDocument((event) => {
        return this.openTextDocument(event);
      }),
    );
    disposables.push(
      this._connection.onDidCloseTextDocument((event) => {
        return this.closeTextDocument(event);
      }),
    );
    disposables.push(
      this._connection.onDidChangeTextDocument((event) => {
        return this.changeTextDocument(event);
      }),
    );
    disposables.push(
      this._connection.onDidChangeWatchedFiles(async (params) => {
        const changes = params.changes;
        await Promise.all(
          changes
            .filter((change) => change.type == FileChangeType.Deleted)
            .map((change) => this.deleteFile(change.uri)),
        );
        await Promise.all(
          changes
            .filter((change) => change.type == FileChangeType.Created)
            .map((change) => this.createFile(change.uri)),
        );
        await Promise.all(
          changes
            .filter((change) => change.type == FileChangeType.Changed)
            .map((change) => this.changeFile(change.uri)),
        );
      }),
    );
    disposables.push(
      this._connection.onRequest(
        "workspace/textDocumentContent",
        (params: { uri: string }) => {
          const document = this._documents.get(params.uri);
          if (!document) {
            throw new ResponseError(
              ErrorCodes.InvalidRequest,
              `Document does not exist: ${params.uri}`,
            );
          }
          const text = document.getText();
          return { text };
        },
      ),
    );
    return Disposable.create(() => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    });
  }
}
