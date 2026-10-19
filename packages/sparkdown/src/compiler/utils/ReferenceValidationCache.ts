import type { DiagnosticSeverity } from "../types/SparkDiagnostic";

/** What validating one reference produced, at offsets relative to a start the
 *  holder names (its chunk's, or its own): a diagnostic, a color annotation,
 *  or both. */
export interface ReferenceOutcome {
  from: number;
  to: number;
  diagnostic?: { severity: DiagnosticSeverity; message: string };
  color?: boolean;
}

/** The entries of the context a validation read that the context's
 *  per-compile layer can change. */
export interface ReferenceReads {
  /** `type/name` of every context entry looked up by name. */
  keys?: Set<string>;
  /** Every context type read as a whole table. */
  types?: Set<string>;
}

/** One chunk's validated references. */
export interface ReferenceChunkEntry extends ReferenceReads {
  /** The chunk's length, which a block carried by identity keeps. */
  length: number;
  /** How many references start in the chunk. */
  references: number;
  /** At offsets relative to the chunk's start. */
  outcomes: ReferenceOutcome[];
}

/** One reference's outcomes, at offsets relative to its own start. */
export interface ReferenceEntry extends ReferenceReads {
  length: number;
  outcomes: ReferenceOutcome[];
  /** The cache's generation and layer version it was validated at. */
  generation: number;
  version: number;
}

/** The story-wide inputs of reference validation that are not read from the
 *  context's layer. Any of them moving drops every entry. */
export interface ReferenceValidationInputs {
  /** What keys the context's base (the builtins, the project's defines, its
   *  files and the `$default` merge over them): the root, the files epoch and
   *  the configuration, and the chunks that contributed to it. Not the base's
   *  revision, which moves whenever the base is assembled again: a preview
   *  compile that edits a define assembles a base of its own, and the next
   *  real compile assembles the real one again, with the same key. */
  base: string;
  baseIds: readonly object[];
  definitions: unknown;
  builtins: unknown;
  /** The functions, scenes and knots a handler can name. */
  handlerCallables: string;
  /** The types a define declares as parents. */
  declaredParentTypes: string;
}

// How many layer changes a reference entry is checked against before the
// cache starts over rather than keep a longer history.
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

/**
 * The results of `validateReferences` (#411), kept across compiles at two
 * grains.
 *
 * A chunk is a top-level block of the compilation annotator, named by its
 * `CompiledBlock`: the incremental parse carries a block outside the reparse
 * window forward by identity, and every block the window touches is lowered
 * again under a new one. The references annotator is re-run over that same
 * window, so a block that kept its identity holds the same references, only
 * moved, and a compile serves its outcomes without visiting them.
 *
 * A top-level block can be a whole scene, though, and the window is a line or
 * two of it. Inside a block lowered again, a reference outside the window keeps
 * its annotation, which the annotation set carries by identity as it carries
 * the block's (no annotator writes an annotation after making it, and one
 * remade outside the window is dropped in favour of the identical one it would
 * replace). So each reference's own outcomes are kept as well, keyed by its
 * annotation, and only the references the window annotated anew are validated.
 *
 * Outcomes are kept at offsets relative to their holder's start, so moving them
 * costs nothing until they are read.
 *
 * What a reference's validity reads besides itself is story-wide. The parts
 * no ordinary edit changes are compared whole (`ReferenceValidationInputs`).
 * The context's layer is not: it holds the implicit definitions this compile's
 * scene content implies (`[[bunny:phone]]`), and an edit to such a directive
 * moves it. So each entry records the context entries it looked up, and a
 * layer change drops only the entries that read an entry it added or removed.
 */
export class ReferenceValidationCache {
  protected _inputs?: ReferenceValidationInputs;
  protected _layer = new Set<string>();
  protected _layerRevision?: string;
  protected _byUri = new Map<string, Map<object, ReferenceChunkEntry>>();
  protected _next = new Map<string, Map<object, ReferenceChunkEntry>>();
  protected _references = new WeakMap<object, ReferenceEntry>();
  // A reference entry is current when it was made in this generation and no
  // layer change since its version touched what it read. Chunk entries are
  // dropped as the change happens; reference entries cannot be enumerated.
  protected _generation = 0;
  protected _version = 0;
  protected _layerChanges: {
    version: number;
    keys: string[];
    types: Set<string>;
  }[] = [];

  /** Brings the cache to this compile's inputs and layer, dropping what they
   *  invalidate. `layer` is the `type/name` of every entry the layer adds,
   *  and `layerRevision` names that set, so an unchanged layer is not
   *  compared entry by entry. */
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
      // A `$`-prefixed entry is read by type, not by a reference's name
      // (`$default`, `$schema`, `$optional`), and no entry records it.
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

  /** The outcomes kept for `block` of `uri`, carried into this compile. */
  take(uri: string, block: object): ReferenceChunkEntry | undefined {
    const entry = this._byUri.get(uri)?.get(block);
    if (entry) {
      this.keep(uri, block, entry);
    }
    return entry;
  }

  /** Keeps `entry` for `block` of `uri` into the next compile. */
  keep(uri: string, block: object, entry: ReferenceChunkEntry) {
    let entries = this._next.get(uri);
    if (!entries) {
      entries = new Map();
      this._next.set(uri, entries);
    }
    entries.set(block, entry);
  }

  /** The outcomes kept for the reference annotated by `annotation`, if they
   *  still hold. */
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

  /** Keeps a reference's outcomes, keyed by its annotation. */
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

  /** Ends this compile: only the blocks it held are kept. */
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
