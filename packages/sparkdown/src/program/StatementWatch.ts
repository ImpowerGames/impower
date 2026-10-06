/**
 * What a compile learns about the statements whose chunks the store keeps
 * without reading them again (docs/engine/binary-program.md, section 1,
 * Identity).
 *
 * A chunk records, as the writer emits it, how each name its code reads
 * resolved and each text the compiler names by document order. A statement
 * the incremental parse carried keeps its parsed objects, and the compile
 * resolves them again (`ParsedObject.ResolveReferences`) and names their texts
 * again (`SparkdownCompiler.canonicalizeSyntheticFlowNames`). The watch is
 * where those passes report what they found: each object whose value a
 * committed chunk recorded is watched with the reader of that value, and an
 * object that now reads otherwise marks its statement changed. The store
 * reads a statement's values again only when the watch marked it, or when the
 * statement's parsed objects are new, so the values of every other statement
 * are read nowhere: the watch is the reader that recorded them, and a new
 * kind of value is a new reader, with no detector added anywhere else.
 */
export class StatementWatch {
  /** The statements, by the block that stands for each, one of whose watched
   *  objects read otherwise in the compile in progress. */
  readonly changed = new Set<object>();

  protected _watched = new WeakMap<
    object,
    { block: object; value: string; read: (obj: any) => string }
  >();

  /** Watches `obj`, whose value as `read` reads it now is what the chunk of
   *  the statement `block` stands for recorded. */
  watch(obj: object, block: object, read: (obj: any) => string): void {
    this._watched.set(obj, { block, value: read(obj), read });
  }

  /** Reports that `obj` was resolved or named again: a watched object whose
   *  value now reads otherwise marks its statement changed. */
  note(obj: object): void {
    const watched = this._watched.get(obj);
    if (watched && watched.read(obj) !== watched.value) {
      this.changed.add(watched.block);
    }
  }
}

let active: StatementWatch | null = null;

/** Makes `watch` the one the compile's passes report to, and returns the one
 *  it replaces, which the caller restores. */
export const watchStatements = (
  watch: StatementWatch | null,
): StatementWatch | null => {
  const previous = active;
  active = watch;
  return previous;
};

/** Reports that a pass of the compile resolved or named `obj` again. */
export const noteResolved = (obj: object): void => {
  active?.note(obj);
};

// A number for each object a watched value names, so that a value that
// resolves to another object of the same name reads otherwise.
const ids = new WeakMap<object, number>();
let nextId = 0;

/** A number that names `obj` for as long as it lives, or `-` for none. */
export const identityOf = (obj: object | null | undefined): string => {
  if (!obj) {
    return "-";
  }
  let id = ids.get(obj);
  if (id === undefined) {
    id = nextId++;
    ids.set(obj, id);
  }
  return String(id);
};
