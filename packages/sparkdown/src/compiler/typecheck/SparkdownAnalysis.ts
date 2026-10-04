import type { Tree } from "@lezer/common";
import type {
  AnalysisCheckResult, AnalysisDefinition, AnalysisHandle, AnalysisMode, AnalysisOutcome,
  AnalysisProject, AnalysisQueryResult, AnalysisRequest, AnalysisUpdate,
  AnalysisSourceQueryResult, AnalysisSourceField,
} from "../../analysis-backend/contract";
import type { LuauUnit } from "./LuauDocumentChecker";
import { lintComments } from "./Linter";
import { Location, Position } from "./Location";
import { packSparkdownAnalysisAst } from "./SparkdownAnalysisCodec";
import { SparkdownAnalysisInputs, type SparkdownAnalysisDocumentSnapshot } from "./SparkdownAnalysisInputs";
import type { TypecheckDiagnostic } from "./SparkdownTypechecker";

export interface SparkdownAnalysisDocument {
  uri: string; version: number; text: string; tree: Tree;
  units: readonly LuauUnit[]; mode: AnalysisMode;
  sourceUri?: string;
}
export interface SparkdownAnalysisResolution {
  contextUri: string; contextUnit: number; specifier: string;
  /** The host selects the actual return module; the facade never guesses a .sd scene. */
  targetUri: string; targetUnit: number;
}
export interface SparkdownAnalysisCompile {
  /** Complete documents in the requested checking order. */
  documents: readonly SparkdownAnalysisDocument[];
  programNames: readonly string[];
  resolutions?: readonly SparkdownAnalysisResolution[];
  definitions?: readonly AnalysisDefinition[];
  removeDefinitions?: readonly string[];
}
export interface SparkdownAnalysisPublication {
  outcome: AnalysisOutcome;
  check?: AnalysisCheckResult;
  documents: readonly SparkdownAnalysisDocumentSnapshot[];
  diagnostics: ReadonlyMap<string, readonly TypecheckDiagnostic[]>;
  stats: { encoded: number; reused: number; checked: number };
}
export interface SparkdownAnalysisSourceQuery extends AnalysisSourceQueryResult {
  /** Effective facts projected through the owning target's current map. Origin
   * facts deliberately remain in their original unit coordinates. */
  locations: readonly (AnalysisSourceField & { uri: string; mapEpoch: number })[];
  allMapped: boolean;
}

/** An awaited compiler analysis phase. Native graphs stay inside AnalysisProject;
 * this facade retains immutable converter inputs and published source maps only.
 */
export class SparkdownAnalysis {
  private inputs = new SparkdownAnalysisInputs();
  private documents = new Map<string, SparkdownAnalysisDocumentSnapshot>();
  private handles = new Map<string, AnalysisHandle>();
  private facts = new Map<string, { key: string; version: number }>();
  private nativeVersions = new Map<string, number>();
  private serial: Promise<unknown> = Promise.resolve();
  private failed = false;
  constructor(private readonly project: AnalysisProject) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serial.then(operation); this.serial = result.catch(() => {}); return result;
  }

  analyze(compile: SparkdownAnalysisCompile, options?: AnalysisRequest): Promise<SparkdownAnalysisPublication> {
    // Capture converter graphs before queueing; unchanged keys borrow immutable
    // prior ASTs. Preparation against publication happens inside the queue.
    const documents = compile.documents.map(document => ({ ...document, units: this.inputs.capture(document.uri, document.units) }));
    const names = [...new Set(compile.programNames)].sort();
    const resolutions = compile.resolutions?.map(edge => ({ ...edge })) ?? [];
    const definitions = compile.definitions?.map(d => ({ ...d }));
    const removeDefinitions = compile.removeDefinitions?.slice();
    return this.enqueue(async () => {
      if (this.failed) throw Error("Reset analysis after an unsuccessful publication");
      const seen = new Set<string>();
      for (const document of documents) {
        if (seen.has(document.uri)) throw Error("Duplicate analysis document URI"); seen.add(document.uri);
      }
      const snapshots = documents.map(document => this.inputs.prepareCaptured(document.uri, document.version, document.units));
      const byUri = new Map(snapshots.map(snapshot => [snapshot.uri, snapshot]));
      const removed = [...this.documents.values()].filter(snapshot => !byUri.has(snapshot.uri));
      const desiredModules = new Set(snapshots.flatMap(snapshot => snapshot.units.map(unit => unit.module)));
      // A successful native update can precede a failed check/publication.
      // Reconcile installed inputs as well as previously published maps.
      const removeDocuments = [...new Set([...removed.flatMap(d => d.units.map(u => u.module)), ...snapshots.flatMap(s => s.removals),
        ...[...this.nativeVersions.keys()].filter(module => !desiredModules.has(module))])];
      const update: AnalysisUpdate = { projectVersion: this.project.projectVersion + 1,
        documents: [], removeDocuments,
        definitions, removeDefinitions, scopeLinks: [], removeScopeLinks: [], documentModes: [], moduleIdentities: [], moduleResolutions: [] };
      const facts = new Map(this.facts), versions = new Map(this.nativeVersions);
      const fact = (id: string, key: string): number | undefined => {
        const previous = facts.get(id); if (previous?.key === key) return undefined;
        const version = (previous?.version ?? 0) + 1; facts.set(id, { key, version }); return version;
      };
      const environment = fact("program", JSON.stringify(names));
      if (environment !== undefined) update.programEnvironment = { version: environment, values: names, types: names };
      for (let index = 0; index < snapshots.length; index++) {
        const snapshot = snapshots[index]!, document = documents[index]!;
        const prelude = snapshot.units.find(unit => unit.kind === "prelude");
        for (const input of snapshot.updates) {
          const version = (versions.get(input.module) ?? 0) + 1; versions.set(input.module, version);
          update.documents!.push({ module: input.module, version, kind: "ast", ast: packSparkdownAnalysisAst(input.ast) });
        }
        for (const unit of snapshot.units) {
          const sourceUri = document.sourceUri ?? document.uri;
          const identity = fact("identity:" + unit.module, sourceUri);
          if (identity !== undefined) update.moduleIdentities!.push({ module: unit.module, version: identity, sourceUri });
          const mode = fact("mode:" + unit.module, document.mode);
          if (mode !== undefined) update.documentModes!.push({ module: unit.module, version: mode, mode: document.mode });
          if (unit.kind === "flow" && prelude) {
            const link = fact("scope:" + unit.module, prelude.module);
            if (link !== undefined) update.scopeLinks!.push({ module: unit.module, version: link, prelude: prelude.module });
          } else if (facts.delete("scope:" + unit.module)) {
            update.removeScopeLinks!.push(unit.module);
          }
          const edges = resolutions.filter(edge => edge.contextUri === snapshot.uri && edge.contextUnit === snapshot.units.indexOf(unit)).map(edge => {
            if (!Number.isSafeInteger(edge.targetUnit) || edge.targetUnit < 0) throw Error("Invalid resolution target unit");
            const target = byUri.get(edge.targetUri)?.units[edge.targetUnit];
            const targetDocument = documents.find(d => d.uri === edge.targetUri);
            return { specifier: edge.specifier,
              targetModule: target?.module ?? "sparkdown-missing:" + encodeURIComponent(edge.targetUri) + ":" + edge.targetUnit,
              targetSourceUri: targetDocument?.sourceUri ?? edge.targetUri };
          });
          const resolution = fact("resolution:" + unit.module, JSON.stringify(edges));
          if (resolution !== undefined) update.moduleResolutions!.push({ module: unit.module, version: resolution, resolutions: edges });
        }
      }
      for (const edge of resolutions) {
        const context = byUri.get(edge.contextUri);
        if (!Number.isSafeInteger(edge.contextUnit) || !context?.units[edge.contextUnit]) throw Error("Invalid resolution context unit");
      }
      for (const module of update.removeDocuments!) {
        for (const kind of ["identity", "mode", "scope", "resolution"]) facts.delete(kind + ":" + module);
        versions.delete(module);
      }
      const outcome = await this.project.update(update, options);
      if (outcome.status !== "ok") { this.failed = true; return { outcome, documents: [], diagnostics: new Map(), stats: { encoded: 0, reused: 0, checked: 0 } }; }
      this.facts = facts; this.nativeVersions = versions;
      const roots = snapshots.flatMap(snapshot => snapshot.units.map(unit => unit.module));
      const check = roots.length ? await this.project.checkModules(roots, options) : undefined;
      if (check && check.status !== "ok") {
        this.failed = true; return { outcome: check, check, documents: [], diagnostics: new Map(), stats: { encoded: 0, reused: 0, checked: check.checkedModules } };
      }
      const diagnostics = new Map<string, readonly TypecheckDiagnostic[]>();
      for (let index = 0; index < snapshots.length; index++) diagnostics.set(snapshots[index]!.uri,
        this.projectDiagnostics(snapshots[index]!, documents[index]!, check));
      this.inputs.publish(snapshots, removed);
      this.documents = byUri; this.handles = new Map(check?.documents.map(handle => [handle.module, handle]) ?? []);
      return { outcome: check ?? outcome, check, documents: Object.freeze(snapshots), diagnostics,
        stats: { encoded: snapshots.reduce((n, s) => n + s.stats.encoded, 0), reused: snapshots.reduce((n, s) => n + s.stats.reused, 0), checked: check?.checkedModules ?? 0 } };
    });
  }

  private projectDiagnostics(snapshot: SparkdownAnalysisDocumentSnapshot, document: { text: string; tree: Tree }, check?: AnalysisCheckResult): readonly TypecheckDiagnostic[] {
    const diagnostics: TypecheckDiagnostic[] = [];
    const lineStarts = [0]; for (let i = document.text.indexOf("\n"); i >= 0; i = document.text.indexOf("\n", i + 1)) lineStarts.push(i + 1);
    for (const unit of snapshot.units) {
      const position = (line: number, column: number) => ({ line: unit.lines[Math.min(Math.max(line, 0), unit.lines.length - 1)] ?? 0, character: column });
      const syntaxEnds = new Set<string>();
      for (const error of unit.ast.errors) {
        if (!error.malformed) continue;
        const start = position(...error.range.begin); let end = position(...error.range.end);
        if (error.message.startsWith("Expected type") && (end.line > start.line + 1 || (end.line === start.line + 1 && end.character > 0)))
          end = start.line + 1 < lineStarts.length ? { line: start.line + 1, character: 0 } : end;
        else {
          const after = end.line > start.line || (end.line === start.line && end.character > start.character);
          if (!(after && (!error.message.endsWith("got <eof>") || end.character === 0))) {
            const line = after ? end.line : start.line;
            end = line + 1 < lineStarts.length ? { line: line + 1, character: 0 } : after ? end : start;
          }
        }
        const token = end.line + ":" + end.character;
        let label = false;
        for (let node = document.tree.resolveInner(Math.max(0, (lineStarts[end.line] ?? document.text.length) + end.character - 1), 1); node; node = node.parent!)
          if (node.name === "LuauLabel") { label = true; break; }
        if (!syntaxEnds.has(token) && !label) { syntaxEnds.add(token); diagnostics.push({ start, end, code: "SyntaxError", message: error.message, syntax: true }); }
      }
      for (const diagnostic of check?.diagnostics ?? []) if (diagnostic.module === unit.module) {
        if (!diagnostic.kind) throw Error("Native diagnostic kind is unavailable");
        if (diagnostic.parseErrorOrdinal !== undefined) continue; // Converter owns syntax publication, including nocheck.
        diagnostics.push({ start: position(diagnostic.range.start.line, diagnostic.range.start.column), end: position(diagnostic.range.end.line, diagnostic.range.end.column),
          code: diagnostic.kind, message: diagnostic.message,
          ...(diagnostic.unknownSymbol?.context === "binding" ? { unknownGlobal: diagnostic.unknownSymbol.name } : {}) });
      }
      if (unit.kind === "file") for (const warning of lintComments(unit.ast.hotcomments.map(comment => ({ header: comment.header, content: comment.content,
        location: new Location(new Position(...comment.range.begin), new Position(...comment.range.end)) }))))
        diagnostics.push({ start: position(warning.location.begin.line, warning.location.begin.column), end: position(warning.location.end.line, warning.location.end.column), code: "CommentDirective", message: warning.text });
    }
    return Object.freeze(diagnostics.map(diagnostic => Object.freeze(diagnostic)));
  }

  queryType(snapshot: SparkdownAnalysisDocumentSnapshot, line: number, column: number, maxLength = 4096, options?: AnalysisRequest): Promise<AnalysisQueryResult | undefined> {
    return this.enqueue(async () => {
      if (this.failed || !this.inputs.current(snapshot)) throw Error("Stale analysis source map");
      const position = this.inputs.unitPosition(snapshot, line, column); if (!position) return undefined;
      const handle = this.handles.get(position.module); if (!handle) throw Error("Unchecked analysis source map");
      return this.project.queryType(handle, { line: position.line, column: position.column }, maxLength, options);
    });
  }
  querySourceMetadata(snapshot: SparkdownAnalysisDocumentSnapshot, line: number, column: number, maxFields = 64, options?: AnalysisRequest): Promise<SparkdownAnalysisSourceQuery | undefined> {
    return this.enqueue(async () => {
      if (this.failed || !this.inputs.current(snapshot)) throw Error("Stale analysis source map");
      const position = this.inputs.unitPosition(snapshot, line, column); if (!position) return undefined;
      const handle = this.handles.get(position.module); if (!handle) throw Error("Unchecked analysis source map");
      const result = await this.project.querySourceMetadata(handle, { line: position.line, column: position.column }, maxFields, options);
      const locations: (AnalysisSourceField & { uri: string; mapEpoch: number })[] = [];
      let allMapped = result.effective?.complete ?? false;
      for (const field of result.effective?.fields ?? []) {
        let mapped = false;
        for (const target of this.documents.values()) {
          const unit = target.units.find(unit => unit.module === field.module); if (!unit) continue;
          const begin = unit.lines[field.range.start.line], end = unit.lines[field.range.end.line];
          if (begin !== undefined && end !== undefined) {
            locations.push(Object.freeze({ ...field, uri: target.uri, mapEpoch: target.mapEpoch,
              range: Object.freeze({ start: Object.freeze({ line: begin, column: field.range.start.column }),
                end: Object.freeze({ line: end, column: field.range.end.column }) }) })); mapped = true;
          }
          break;
        }
        if (!mapped) allMapped = false;
      }
      return { ...result, locations: Object.freeze(locations), allMapped };
    });
  }

  reset(options?: AnalysisRequest): Promise<AnalysisOutcome> {
    return this.enqueue(async () => {
      const result = await this.project.reset(options); this.handles.clear();
      this.failed = result.status !== "ok"; return result;
    });
  }
  dispose(): Promise<void> { return this.enqueue(async () => { this.failed = true; this.handles.clear(); this.documents.clear(); await this.project.dispose(); }); }
}
