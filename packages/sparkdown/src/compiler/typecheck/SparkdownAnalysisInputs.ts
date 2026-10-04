import type { LuauUnit } from "./LuauDocumentChecker";
import { encodeSparkdownAnalysisAst, type SparkdownAnalysisAst } from "./SparkdownAnalysisAst";

export interface SparkdownAnalysisInput {
  readonly module: string;
  readonly unitVersion: number;
  readonly ast: SparkdownAnalysisAst;
}
/** Captured before queueing; contains no caller-owned converter nodes. */
export interface SparkdownAnalysisCapturedUnit {
  readonly kind: LuauUnit["kind"];
  readonly key: string;
  readonly lines: readonly number[];
  readonly queryLocations: SparkdownAnalysisUnitSnapshot["queryLocations"];
  readonly ast: SparkdownAnalysisAst;
  readonly encoded: boolean;
}

/** A mapping belongs to one immutable document/request snapshot. */
export interface SparkdownAnalysisUnitSnapshot extends SparkdownAnalysisInput {
  readonly kind: LuauUnit["kind"];
  readonly key: string;
  readonly lines: readonly number[];
  readonly queryLocations: readonly { readonly begin: readonly [number, number]; readonly end: readonly [number, number] }[];
}

export interface SparkdownAnalysisDocumentSnapshot {
  readonly uri: string;
  readonly documentVersion: number;
  readonly mapEpoch: number;
  readonly units: readonly SparkdownAnalysisUnitSnapshot[];
  readonly updates: readonly SparkdownAnalysisInput[];
  readonly removals: readonly string[];
  readonly stats: { readonly encoded: number; readonly reused: number };
}

function frozenAst(ast: SparkdownAnalysisAst): SparkdownAnalysisAst {
  const pending: object[] = [ast], seen = new Set<object>();
  while (pending.length) {
    const item = pending.pop()!;
    if (seen.has(item)) continue;
    seen.add(item);
    for (const value of Object.values(item)) if (value && typeof value === "object") pending.push(value);
    Object.freeze(item);
  }
  return ast;
}

/** Retains AST inputs by semantic unit key, independently of native checks.
 * Environment/export generations govern checking elsewhere; they never force
 * an unchanged syntax unit through the encoder again.
 */
export class SparkdownAnalysisInputs {
  private documents = new Map<string, SparkdownAnalysisDocumentSnapshot>();
  private prepared = new WeakMap<SparkdownAnalysisDocumentSnapshot, SparkdownAnalysisDocumentSnapshot | undefined>();
  private nextModule = 0;
  private nextMapEpoch = 0;

  update(uri: string, documentVersion: number, units: readonly LuauUnit[]): SparkdownAnalysisDocumentSnapshot {
    const snapshot = this.prepare(uri, documentVersion, units);
    this.publish([snapshot]);
    return snapshot;
  }

  /** Prepare immutable inputs/maps without publishing before a backend succeeds. */
  prepare(uri: string, documentVersion: number, units: readonly LuauUnit[]): SparkdownAnalysisDocumentSnapshot {
    return this.prepareCaptured(uri, documentVersion, this.capture(uri, units));
  }

  /** Unchanged units borrow the retained immutable AST without re-encoding. */
  capture(uri: string, units: readonly LuauUnit[]): readonly SparkdownAnalysisCapturedUnit[] {
    const available = new Map<string, SparkdownAnalysisUnitSnapshot[]>();
    for (const unit of this.documents.get(uri)?.units ?? []) {
      const key = unit.kind + "\u0000" + unit.key;
      const matches = available.get(key) ?? []; matches.push(unit); available.set(key, matches);
    }
    return Object.freeze(units.map(unit => {
      if (!unit.queryLocations) throw new Error("Analysis queries require authoritative token locations");
      const retained = available.get(unit.kind + "\u0000" + unit.key)?.shift();
      return Object.freeze({ kind: unit.kind, key: unit.key, lines: Object.freeze([...unit.lines]),
        queryLocations: Object.freeze(unit.queryLocations.map(location => Object.freeze({
          begin: Object.freeze([location.begin.line, location.begin.column] as const),
          end: Object.freeze([location.end.line, location.end.column] as const),
        }))), ast: retained?.ast ?? frozenAst(encodeSparkdownAnalysisAst(unit)), encoded: !retained });
    }));
  }

  /** Allocate identities against the last committed state when a queued request runs. */
  prepareCaptured(uri: string, documentVersion: number, units: readonly SparkdownAnalysisCapturedUnit[]): SparkdownAnalysisDocumentSnapshot {
    if (!Number.isSafeInteger(documentVersion) || documentVersion < 0) throw new Error("Invalid analysis document version");
    const previous = this.documents.get(uri);
    if (previous && documentVersion < previous.documentVersion) throw new Error("Stale analysis document version");
    if (previous && documentVersion === previous.documentVersion
      && (units.length !== previous.units.length || units.some((unit, index) => {
        const prior = previous.units[index]!;
        return unit.kind !== prior.kind || unit.key !== prior.key || unit.lines.length !== prior.lines.length
          || unit.lines.some((line, i) => line !== prior.lines[i]);
      }))) throw new Error("Changed analysis input requires a new document version");

    const prior = previous?.units ?? [];
    const available = new Map<string, SparkdownAnalysisUnitSnapshot[]>();
    for (const unit of prior) {
      const key = unit.kind + "\u0000" + unit.key;
      const matches = available.get(key) ?? [];
      matches.push(unit); available.set(key, matches);
    }
    // Reserve exact matches first. A changed unit cannot steal the identity of
    // an unchanged unit that moved later in the document.
    const matches = units.map(unit => available.get(unit.kind + "\u0000" + unit.key)?.shift());
    const retained = new Set(matches.filter((unit): unit is SparkdownAnalysisUnitSnapshot => !!unit));
    const unused = prior.filter(unit => !retained.has(unit));
    const updates: SparkdownAnalysisInput[] = [];
    const snapshots = units.map((unit, index): SparkdownAnalysisUnitSnapshot => {
      const queryLocations = unit.queryLocations;
      const match = matches[index];
      if (match) {
        return Object.freeze({ ...match, queryLocations, lines: Object.freeze([...unit.lines]) });
      }
      const candidateIndex = unused.findIndex(old => old.kind === unit.kind);
      const candidate = candidateIndex < 0 ? undefined : unused.splice(candidateIndex, 1)[0];
      const input = Object.freeze({
        module: candidate?.module ?? "sparkdown-unit:" + this.nextModule++,
        unitVersion: (candidate?.unitVersion ?? 0) + 1,
        ast: unit.ast,
      });
      updates.push(input);
      return Object.freeze({ ...input, kind: unit.kind, key: unit.key, queryLocations, lines: Object.freeze([...unit.lines]) });
    });
    const snapshot: SparkdownAnalysisDocumentSnapshot = Object.freeze({
      uri, documentVersion, mapEpoch: ++this.nextMapEpoch,
      units: Object.freeze(snapshots), updates: Object.freeze(updates),
      removals: Object.freeze(unused.map(unit => unit.module)),
      stats: Object.freeze({ encoded: units.filter(unit => unit.encoded).length, reused: units.filter(unit => !unit.encoded).length }),
    });
    // Encoding failures and rejected native transactions leave publication intact.
    this.prepared.set(snapshot, previous);
    return snapshot;
  }

  /** Commit a whole analysis publication, or reject it without partial map changes. */
  publish(snapshots: readonly SparkdownAnalysisDocumentSnapshot[], removals: readonly SparkdownAnalysisDocumentSnapshot[] = []): void {
    const uris = new Set<string>();
    for (const snapshot of snapshots) {
      if (uris.has(snapshot.uri) || !this.prepared.has(snapshot)
        || this.documents.get(snapshot.uri) !== this.prepared.get(snapshot)) throw new Error("Stale analysis publication");
      uris.add(snapshot.uri);
    }
    for (const snapshot of removals) {
      if (uris.has(snapshot.uri) || !this.current(snapshot)) throw new Error("Stale analysis removal");
      uris.add(snapshot.uri);
    }
    for (const snapshot of snapshots) { this.documents.set(snapshot.uri, snapshot); this.prepared.delete(snapshot); }
    for (const snapshot of removals) this.documents.delete(snapshot.uri);
  }

  remove(uri: string): readonly string[] {
    const prior = this.documents.get(uri);
    this.documents.delete(uri);
    return Object.freeze(prior?.units.map(unit => unit.module) ?? []);
  }

  current(snapshot: SparkdownAnalysisDocumentSnapshot): boolean {
    return this.documents.get(snapshot.uri) === snapshot;
  }

  unitPosition(snapshot: SparkdownAnalysisDocumentSnapshot, documentLine: number, column: number):
    { module: string; unitVersion: number; line: number; column: number } | undefined {
    if (!this.current(snapshot) || !Number.isSafeInteger(documentLine) || !Number.isSafeInteger(column) || column < 0) return undefined;
    for (const unit of snapshot.units) {
      const line = unit.lines.indexOf(documentLine);
      if (line >= 0 && unit.queryLocations.some(range =>
        (line > range.begin[0] || (line === range.begin[0] && column >= range.begin[1]))
        && (line < range.end[0] || (line === range.end[0] && column < range.end[1]))))
        return { module: unit.module, unitVersion: unit.unitVersion, line, column };
    }
    return undefined;
  }
}
