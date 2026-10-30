import type { DiagnosticSeverity } from "../types/SparkDiagnostic";

export interface ReferenceOutcome {
  from: number;
  to: number;
  diagnostic?: { severity: DiagnosticSeverity; message: string };
  color?: boolean;
  declared?: string;
}

export interface ReferenceReads {
  keys?: Set<string>;
  types?: Set<string>;
}

export interface ReferenceChunkEntry extends ReferenceReads {
  length: number;
  references: number;
  outcomes: ReferenceOutcome[];
}

export interface ReferenceEntry extends ReferenceReads {
  length: number;
  outcomes: ReferenceOutcome[];
  generation: number;
  version: number;
}

export interface ReferenceValidationInputs {
  base: string;
  baseIds: readonly object[];
  definitions: unknown;
  builtins: unknown;
  handlerCallables: string;
  declaredParentTypes: string;
}

const MAX_LAYER_CHANGES = 32;

const readsAny = (
  reads: ReferenceReads,
  keys: readonly string[],
  types: ReadonlySet<string>,
) => {
  if (reads.types) {
    for (const type of types) {
      if (reads.types.has(type)) return true;
    }
  }
  if (reads.keys) {
    for (const key of keys) {
      if (reads.keys.has(key)) return true;
    }
  }
  return false;
};

export class ReferenceValidationCache {
  protected _inputs?: ReferenceValidationInputs;
  protected _layer = new Set<string>();
  protected _layerRevision?: string;
  protected _byUri = new Map<string, Map<object, ReferenceChunkEntry>>();
  protected _next = new Map<string, Map<object, ReferenceChunkEntry>>();
  protected _references = new WeakMap<object, ReferenceEntry>();
  protected _generation = 0;
  protected _version = 0;
  protected _layerChanges: {
    version: number;
    keys: string[];
    types: Set<string>;
  }[] = [];

  begin(
    inputs: ReferenceValidationInputs,
    layerRevision: string,
    layer: readonly string[],
  ) {
    this._next = new Map();
    const previous = this._inputs;
    this._inputs = inputs;
    if (
      !previous ||
      previous.baseIds.length !== inputs.baseIds.length ||
      previous.baseIds.some((id, i) => id !== inputs.baseIds[i]) ||
      (Object.keys(inputs) as (keyof ReferenceValidationInputs)[]).some(
        (key) => key !== "baseIds" && previous[key] !== inputs[key],
      )
    ) {
      this.reset(layerRevision, layer);
      return;
    }
    if (layerRevision === this._layerRevision) {
      return;
    }
    const current = new Set(layer);
    const keys: string[] = [];
    for (const key of current) {
      if (!this._layer.has(key)) keys.push(key);
    }
    for (const key of this._layer) {
      if (!current.has(key)) keys.push(key);
    }
    this._layer = current;
    this._layerRevision = layerRevision;
    if (keys.length === 0) {
      return;
    }
    const types = new Set<string>();
    for (const key of keys) {
      const slash = key.indexOf("/");
      if (slash < 0 || key[slash + 1] === "$") {
        this.reset(layerRevision, layer);
        return;
      }
      types.add(key.slice(0, slash));
    }
    if (this._layerChanges.length >= MAX_LAYER_CHANGES) {
      this.reset(layerRevision, layer);
      return;
    }
    this._version += 1;
    this._layerChanges.push({ version: this._version, keys, types });
    for (const entries of this._byUri.values()) {
      for (const [block, entry] of entries) {
        if (readsAny(entry, keys, types)) {
          entries.delete(block);
        }
      }
    }
  }

  take(uri: string, block: object): ReferenceChunkEntry | undefined {
    const entry = this._byUri.get(uri)?.get(block);
    if (entry) {
      this.keep(uri, block, entry);
    }
    return entry;
  }

  keep(uri: string, block: object, entry: ReferenceChunkEntry) {
    let entries = this._next.get(uri);
    if (!entries) {
      entries = new Map();
      this._next.set(uri, entries);
    }
    entries.set(block, entry);
  }

  reference(annotation: object): ReferenceEntry | undefined {
    const entry = this._references.get(annotation);
    if (!entry || entry.generation !== this._generation) {
      return undefined;
    }
    for (const change of this._layerChanges) {
      if (
        change.version > entry.version &&
        readsAny(entry, change.keys, change.types)
      ) {
        return undefined;
      }
    }
    return entry;
  }

  keepReference(
    annotation: object,
    length: number,
    outcomes: ReferenceOutcome[],
    reads: ReferenceReads,
  ) {
    this._references.set(annotation, {
      length,
      outcomes,
      keys: reads.keys,
      types: reads.types,
      generation: this._generation,
      version: this._version,
    });
  }

  end() {
    this._byUri = this._next;
    this._next = new Map();
  }

  protected reset(layerRevision: string, layer: readonly string[]) {
    this._byUri = new Map();
    this._layer = new Set(layer);
    this._layerRevision = layerRevision;
    this._generation += 1;
    this._version = 0;
    this._layerChanges = [];
  }
}
