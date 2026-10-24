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

/** The owner a .luau file's own diagnostics are published under while the
 *  file is open in an editor, which the stories that run it leave alone. */
export const LUAU_DOCUMENT_OWNER = "luau-document";

/** How long an open `.luau` document's own compile waits for typing to pause. */
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

  /** The `.luau` files a `run` in the script `uri` finds by name: those of
   *  the project of its nearest main script (`projectLuauFiles`). */
  runLuauFiles(uri: string): string[] {
    return projectLuauFiles(
      this.getMainScriptUri(uri) ?? uri,
      this._watchedFiles.keys(),
      (script) => this._watchedFiles.has(script),
      this.mainScriptFilename,
      this.compilerConfig?.uriPathsAsWritten,
    );
  }

  /**
   * The `.luau` file the operand of a `run` statement in the script `uri`
   * names, as the compiler resolves it (#1389): a quoted operand is a path
   * relative to the script, `.luau` implied, and an unquoted one the name of
   * the one `.luau` file of that name in the project. `undefined` when no
   * file, or more than one, answers.
   */
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

  // Last formatted output per document — the diff baseline for
  // incremental (delta) formatting. Always a genuine format output (see
  // diffDirtyRange's safety note), so the span between it and the current
  // text bounds everything that might need reformatting.
  protected _lastFormattedText = new Map<string, string>();

  // The byte range that may need reformatting since the last format, or
  // undefined for a full format (no baseline yet). `currentText` is the
  // document's current text.
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

  /**
   * Project scripts are registered with deferred parses (see onCreatedFile)
   * so initialize can return immediately. Warm them here in the background --
   * smallest first, one per tick so early feature requests aren't stuck
   * behind the whole project -- because some features (e.g. completions) read
   * every script's annotations and would otherwise pay all outstanding
   * parses at once on first use. tree() is a no-op for anything already
   * parsed on demand in the meantime.
   */
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
        // The document can have been removed since the list was captured;
        // touching it would just recreate an empty registry state entry.
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
    // The editor no longer shows the file: its own diagnostics go, and the
    // story entries that read it own its diagnostics again.
    if (this._lastPublishedDiagnostics.get(uri)?.owner === LUAU_DOCUMENT_OWNER) {
      this._lastPublishedDiagnostics.delete(uri);
      this.sendNotification(PublishDiagnosticsNotification.method, {
        uri,
        diagnostics: [],
      });
    }
  }

  /** The pending compile of each open `.luau` document, by its uri. */
  protected _luauDocumentCompiles = new Map<string, ReturnType<typeof setTimeout>>();

  /** Compile an open `.luau` document on its own once typing pauses
   *  (`publishLuauDocument`). Every other document is left to the entries. */
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

  /**
   * A `.luau` document an editor has open is not a story entry (a `run`
   * reads it), but the editor shows its own diagnostics: the document is
   * compiled on its own, read from the grammar's Luau root (I-1320), and its
   * diagnostics are published under `LUAU_DOCUMENT_OWNER` while it stays
   * open. The compile is posted after the document's updates, as an entry's
   * is, and is neither recorded as the last compiled entry nor published as
   * a program.
   */
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

  // Fingerprint + published-at version of the last diagnostics publish per
  // uri, so a compile only notifies files whose diagnostics actually changed.
  // Every publish fans out into client-side feature re-pulls, so N identical
  // publishes per compile multiply into real work. The VERSION must be part
  // of the key: clients that declare versionSupport DROP a publish whose
  // version trails their document (routine mid-typing, since compiles are
  // debounced with a max-wait), so an identical-content publish at a NEWER
  // version must still go out or the client keeps stale squiggles forever.
  protected _lastPublishedDiagnostics = new Map<
    string,
    {
      fingerprint: string;
      version: number | undefined;
      diagnostics: ReturnType<SparkdownWorkspace["getDiagnostics"]>;
      owner: string | undefined;
    }
  >();

  /**
   * Under `stripImageData` (#299) the program's image structs arrive without
   * their inlined SVG source, but LS-side previews (hover/completion
   * `filterImage` calls, composite previews) still read `image.data` — and in
   * VS Code the markdown sanitizer only loads http(s)/data: srcs, so previews
   * of FILTERED svgs must stay data-URI-based. Attach a lazy, self-memoizing
   * `data` getter that rebuilds the source from `_watchedFiles` (which
   * retains every svg's text and refreshes it on change) on first access —
   * so nothing pays for it until a preview actually needs it.
   */
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

  /**
   * Morph bakes (packages/sparkdown/src/morph/README.md). This server holds
   * every artwork's source on every host, so it bakes each compiled reference
   * for its diagnostics and for the rest render previews show. Bake results
   * are kept by artifact key, so a recompile that leaves a key unchanged
   * republishes its diagnostics at once instead of dropping them until the
   * bake answers again.
   */
  protected _morphService?: MorphBakeService;
  protected _morphDiagnostics?: Map<string, MorphBakeDiagnostic[]>;
  protected static readonly MORPH_DIAGNOSTIC_KEYS = 512;
  /** How long a preview waits for a rest render before showing the static one. */
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
        const image = program.context?.["image"]?.[ref.image];
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

  /**
   * Every reference in a program with the variant it is for and the URI of
   * its artwork. Several consumers can share one key (the same art in two
   * files, two names for one selection): the bake runs once per key, but
   * each consumer is its own place to report on.
   */
  protected morphRefs(program: SparkProgram): { variant: string; ref: MorphRef; uri?: string }[] {
    const refs: { variant: string; ref: MorphRef; uri?: string }[] = [];
    for (const [variant, list] of Object.entries(program.morphs?.variants ?? {})) {
      for (const ref of list) {
        const uri = program.context?.["image"]?.[ref.image]?.uri;
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

  /**
   * The bake diagnostics of `program`'s references whose artwork is `uri`.
   * A bake's diagnostics describe the art; where they are shown and which
   * variants they name come from each consumer of the key as this program
   * has it, never from whichever consumer happened to bake it. One problem in
   * the art shows once, naming every variant it affects.
   */
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

  /**
   * Bakes the references whose results this server does not have yet, then
   * republishes the artwork they report on, if `program` is still its
   * entry's latest compile. An older program's late results are kept by key
   * but never published under the newer program.
   */
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
      // Every artwork a baked key reports on, not only the one that baked it.
      const uris = new Set(
        consumers.filter(({ ref, uri }) => uri && pending.has(ref.key)).map(({ uri }) => uri!),
      );
      for (const uri of uris) this.publishDiagnostics(uri, this.getDiagnostics(program, uri), owner);
    });
  }

  /**
   * The rest render of a variant a morph plays on, for a preview: the static
   * render with its rest apertures applied. Undefined when no morph plays on
   * the struct, when the bake fails, or when it does not answer in time; the
   * bake keeps running, so a later preview finds it cached.
   */
  async morphRestRender(context: SparkProgram["context"], struct: any): Promise<string | undefined> {
    if (!context) return undefined;
    // A completion candidate resolves in a private copy of the context that
    // shares the program's image table.
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

  /** Publish `diagnostics` for `uri`, unless they are what was last
   *  published for the document at its current version. */
  protected publishDiagnostics(
    uri: string,
    diagnostics: ReturnType<SparkdownWorkspace["getDiagnostics"]>,
    owner: string | undefined,
  ) {
    const last = this._lastPublishedDiagnostics.get(uri);
    // An open `.luau` document's own compile owns its diagnostics
    // (`publishLuauDocument`): no other publisher replaces them while an
    // editor has it open, though a story that runs it reports under its uri.
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

  /** The runtime errors and warnings of the player's current run, as it last
   *  reported them, and how many project files had been created, changed or
   *  deleted when the report arrived. */
  protected _runtimeDiagnostics?: {
    params: RuntimeDiagnosticsParams;
    files: number;
  };

  /** Counts the project files created, changed and deleted. A changed asset
   *  recompiles the same script versions into another program, which a run
   *  reported before the change did not run. */
  protected _fileChanges = 0;

  /** Take the player's report of its current run in place of the last, and
   *  republish every document either report names, so the last run's
   *  diagnostics go and the new run's are shown if its program has compiled
   *  here. A document's compile diagnostics come from the new run's entry
   *  program when this server has compiled it, and otherwise from the program
   *  that published the document last; the new run's appear once its entry
   *  compiles. */
  reportRuntimeDiagnostics(params: RuntimeDiagnosticsParams) {
    const last = this._runtimeDiagnostics?.params;
    const uris = new Set([
      ...Object.keys(last?.diagnostics ?? {}),
      ...Object.keys(params.diagnostics ?? {}),
    ]);
    this._runtimeDiagnostics = { params, files: this._fileChanges };
    for (const uri of uris) {
      // An open `.luau` document's own compile is no story entry: the run's
      // report is published as its story's, which leaves the document's own
      // diagnostics in place while it stays open (`publishDiagnostics`).
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
        // Nothing is published for a document before a program naming it
        // compiles, and that compile publishes what this report says.
        continue;
      }
      this.publishDiagnostics(
        uri,
        this.getDiagnostics(program, uri),
        owner ?? program.uri ?? entryUri,
      );
    }
  }

  /** The program each entry script last compiled here, by the entry's uri.
   *  Kept apart from the program states, which the workspace fills under
   *  every script a compile names, so an entry that includes another would
   *  otherwise take that entry's place. */
  protected _entryPrograms = new Map<string, SparkProgram>();

  /** The program `uri` last compiled here as an entry script, if it has. */
  protected compiledProgram(uri: string): SparkProgram | undefined {
    return this._entryPrograms.get(uri);
  }

  /** Whether a run built from `ran` ran `program`: the same entry script,
   *  compiled from the same scripts at the same document versions, with no
   *  project file changed since the run was reported. A run of an older
   *  version describes text that has changed since, and one of a newer
   *  version describes text this server has not compiled yet. */
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

  /** `diagnostics` of `uri`, each that has quick fixes carrying them in its
   *  `data`, for a client that asks for no code actions: the web editor's
   *  client shows a diagnostic's `data` as its actions. A client that asks
   *  for code actions gets the same fixes from `getCodeActions`. */
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
      // That client reads `data` as actions alone, so the compiler's own
      // (a run operand's `RunFixData`) does not reach it.
      const { data: _data, ...rest } = diagnostic;
      return rest as T;
    });
  }

  /** The compile's diagnostics for `uri`, then the player's current run's,
   *  while that run ran the program its entry script last compiled here,
   *  whichever program is publishing the document now: compiling another
   *  entry that names the document leaves the run standing. The run's are the
   *  player's report, which this server does not produce, so it shows each
   *  runtime problem once per severity, message and place itself, as #816
   *  requires, rather than rely on the report having done so. */
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
    // Assets need diagnostics even when they have never been opened as text.
    // Include prior publications so warnings removed by repair are cleared,
    // and artwork whose morph bakes reported something.
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
      // While a .luau file is open in an editor, its own compile publishes
      // its diagnostics under LUAU_DOCUMENT_OWNER, and a story that runs it
      // leaves them alone even when it has diagnostics for the file; once
      // that publication is cleared on close, the story's compiles publish
      // the file's again (#1389).
      if (hasLuauExtension(uri) && last?.owner === LUAU_DOCUMENT_OWNER) {
        continue;
      }
      // An unrelated entry point must not clear another program's assets.
      // An explicit asset result transfers ownership even if it is unchanged.
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
    // These refreshes are workspace-wide and carry no params, so once per
    // compile is lossless. (They used to be sent inside the loop above --
    // 2 x tracked-uris redundant refresh storms per keystroke, each of which
    // made clients re-pull folding/semantic tokens for every visible file.)
    this.requestRefresh(FoldingRangeRefreshRequest.method);
    this.requestRefresh(SemanticTokensRefreshRequest.method);
  }

  /** Asks the client to pull a feature again. A client with no editor open
   *  yet may refuse it (#1785); a refresh carries no result, so the refusal
   *  is not a failure. */
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
      // Defer the parse: this fires for EVERY project script during
      // initialize, but this registry only serves language-feature requests,
      // which arrive for documents the user actually has open. Eagerly
      // parsing the whole project here (with all annotators) cost many
      // seconds of time-to-first-interaction on large projects (#224/#285).
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
    // Edited art gets new artifact keys; its old bakes only take memory.
    this._morphService?.invalidate((entry) => entry.uri === file?.uri);
    if (
      file &&
      file.type === "script" &&
      !hasLuauExtension(file.uri) &&
      file.version !== undefined &&
      file.languageId !== undefined
    ) {
      // Only unopened scripts arrive here (see SparkdownWorkspace.changeFile);
      // defer their re-parse until something reads them.
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
      // Assets may belong to a standalone script with no main.sd. Use the
      // latest publication, including repairs, rather than guessing an entry.
      return this._lastPublishedDiagnostics.get(uri)?.diagnostics ?? [];
    }
    const mainUri = this.getMainScriptUri(uri);
    const program = this.program(mainUri ?? uri);
    return program ? this.getDiagnostics(program, uri) : [];
  }

  override async compile(uri: string, force: boolean): Promise<SparkProgram | undefined> {
    // Diagnostics, semantic-token pulls and explicit program requests can all
    // arrive for assets. An asset is not a compiler entry point: compiling it
    // would also replace the last script URI used by subsequent file updates.
    // A Luau file a `run` reads is not one either, but an edit to it changes
    // every story that runs it (#1389): each entry whose last program read the
    // file, which a quoted path can do from another project, compiles again
    // and sees the edit through the file's own version. A file no program has
    // read yet compiles its project's main script.
    if (hasLuauExtension(uri)) {
      // Each entry, and whether its program read an older version of the
      // file. Once one entry has compiled, the file counts as compiled for
      // every later one, so a later entry with an older read is forced.
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
    // Asset inspectors pull just their selected file's messages. Never compile
    // an SVG as a text document or send the full diagnostic map to the client.
    disposables.push(
      this._connection.onRequest("sparkdown/fileDiagnostics", (params: { uri: string }) => {
        return this.getFileDiagnostics(params.uri);
      }),
    );
    disposables.push(
      this._connection.onRequest(
        DocumentDiagnosticRequest.method,
        async (
          params: DocumentDiagnosticParams,
        ): Promise<DocumentDiagnosticReport> => {
          const uri = params.textDocument.uri;
          const document = this._documents.get(uri);
          // Clients may pull diagnostics for an asset after its first publish,
          // including when it is open in an XML editor. Only scripts are valid
          // compiler entry points. Always return a full report for assets so a
          // repair clears an earlier warning without relying on script versions.
          if (!document || !this.isScriptDocument(uri)) {
            return {
              kind: "full",
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
        },
      ),
    );
    disposables.push(
      this._connection.onRequest(
        CompileProgramMessage.method,
        async (
          params: CompileProgramParams,
        ): Promise<SparkProgram | undefined> => {
          // Tolerate the bare `{ uri }` shape older clients sent.
          const uri =
            params.textDocument?.uri ?? (params as { uri?: string }).uri;
          if (!uri) {
            return undefined;
          }
          // force=false: when nothing changed since the last compile this
          // serves the cached program WITHOUT re-compiling or re-notifying.
          // A forced compile here re-broadcast compiler/didCompile, and
          // pull-on-didCompile consumers (the vscode compilation view) would
          // chase their own tail in an infinite pull->compile->notify loop.
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
