/**
 * A `SimpleJson.Writer`-shaped writer that emits the binary program format
 * directly (#314 phase 2).
 *
 * `Story.ToJson` drives a streaming, SAX-style writer: `WriteObjectStart`,
 * `WritePropertyStart`, `Write`, `WriteArrayEnd` and friends. `SimpleJson.Writer`
 * happens to answer those events by building a JS object tree, which is then
 * stringified. Answering the SAME events by appending `[tag, payload, size]`
 * records skips the object tree entirely.
 *
 * ## Why a cached flow is a plain record copy
 *
 * Both of a record's non-tag slots are deliberately position-INDEPENDENT, which
 * is what lezer does and what makes its subtrees relocatable:
 *
 *  - `size` is lezer's fourth value — the records this node and its descendants
 *    occupy. Intrinsic to the node, unlike an end index, so moving a subtree
 *    rewrites nothing inside it.
 *  - `payload` points into a string/number table that PERSISTS across compiles
 *    (see {@link ProgramTable}), the analogue of lezer's grammar-fixed
 *    `NodeSet`. A table rebuilt per compile would make every pointer stale and
 *    force a remap pass over every reused record.
 *
 * With both, splicing an unchanged flow is a bulk copy of its records rather
 * than a per-node rewrite. An earlier revision of this format stored an
 * absolute end index and per-compile tables; that cost 13.0 ms/compile in
 * remapping on the raffles-and-bunny corpus, which is the entire reason a
 * binary path looked like it could not compete with the by-pointer reuse the
 * JSON writer gets for free.
 */
import {
  NODE_WIDTH,
  ProgramNodeTag,
  type ProgramBuffer,
} from "./programBinary";

/**
 * String and number tables shared across compiles.
 *
 * Append-only by construction: an id, once handed out, must stay valid for as
 * long as any cached chunk references it. `generation` is bumped when the
 * table is reseeded, which invalidates every chunk minted against the old one.
 */
export interface ProgramTable {
  strings: string[];
  stringIds: Map<string, number>;
  numbers: number[];
  numberIds: Map<number, number>;
  generation: number;
}

export const createProgramTable = (): ProgramTable => ({
  strings: [],
  stringIds: new Map(),
  numbers: [],
  numberIds: new Map(),
  generation: 0,
});

/**
 * Reseed a table, dropping entries no longer referenced.
 *
 * The table only grows while a session runs, so strings from deleted content
 * accumulate. Callers reseed when the waste is worth the cost: every cached
 * chunk becomes invalid, because its pointers referred to the old numbering.
 */
export const reseedProgramTable = (table: ProgramTable): void => {
  table.strings = [];
  table.stringIds = new Map();
  table.numbers = [];
  table.numberIds = new Map();
  table.generation += 1;
};

/**
 * A serialized top-level flow: just its records.
 *
 * No local tables and no rebasing — the payload pointers are valid against the
 * shared table of the same `generation`, and `size` is already relative.
 */
export interface ProgramChunk {
  readonly nodes: Uint32Array;
  readonly generation: number;
}

/** A chunk plus the fingerprint it was valid for. */
export interface CachedFlowChunk {
  readonly fp: string;
  readonly chunk: ProgramChunk;
}

export class ProgramBinaryWriter {
  private _nodes: number[] = [];
  private _table: ProgramTable;
  /** Indices of records whose `size` is still unpatched, innermost last. */
  private _open: number[] = [];
  private _widest = 0;
  private _currentString: string | null = null;
  private _currentPropertyName: string | null = null;
  /** Armed by `captureNextInjectedAs`; consumed by the next `WriteInjected`. */
  private _pendingCapture: { name: string; fp: string } | null = null;
  private _captured = new Map<string, CachedFlowChunk>();

  constructor(table: ProgramTable = createProgramTable()) {
    this._table = table;
    // Ids already in the table stay valid, so the widest existing pointer is a
    // lower bound on the slot width this buffer needs.
    this._widest = Math.max(
      table.strings.length,
      table.numbers.length,
    );
  }

  // ---------------------------------------------------------------- interning

  private _intern(text: string): number {
    const table = this._table;
    let id = table.stringIds.get(text);
    if (id === undefined) {
      id = table.strings.length;
      table.strings.push(text);
      table.stringIds.set(text, id);
      if (id > this._widest) {
        this._widest = id;
      }
    }
    return id;
  }

  private _internNumber(n: number): number {
    const table = this._table;
    let id = table.numberIds.get(n);
    if (id === undefined) {
      id = table.numbers.length;
      table.numbers.push(n);
      table.numberIds.set(n, id);
      if (id > this._widest) {
        this._widest = id;
      }
    }
    return id;
  }

  // ------------------------------------------------------------------ records

  /** Append a record, returning its index in RECORDS (not slots). */
  private _emit(tag: ProgramNodeTag, value: number): number {
    const index = this._nodes.length / NODE_WIDTH;
    this._nodes.push(tag, value, 0);
    return index;
  }

  /** Patch a record's subtree SIZE, in records, including itself. */
  private _close(index: number): void {
    const size = this._nodes.length / NODE_WIDTH - index;
    this._nodes[index * NODE_WIDTH + 2] = size;
    if (size > this._widest) {
      this._widest = size;
    }
  }

  /** A leaf: opens and closes in one step. */
  private _leaf(tag: ProgramNodeTag, value: number): void {
    this._nodes.push(tag, value, 1);
  }

  // ------------------------------------------------- SimpleJson.Writer surface

  WriteObjectStart(): void {
    this._open.push(this._emit(ProgramNodeTag.Object, 0));
  }

  WriteObjectEnd(): void {
    this._close(this._open.pop()!);
  }

  WriteArrayStart(): void {
    this._open.push(this._emit(ProgramNodeTag.Array, 0));
  }

  WriteArrayEnd(): void {
    this._close(this._open.pop()!);
  }

  WriteObject(inner: (w: ProgramBinaryWriter) => void): void {
    this.WriteObjectStart();
    inner(this);
    this.WriteObjectEnd();
  }

  WritePropertyStart(name: string): void {
    this._open.push(
      this._emit(ProgramNodeTag.Member, this._intern(String(name))),
    );
  }

  WritePropertyEnd(): void {
    const index = this._open.pop()!;
    // A Member must have exactly one child. `WriteInt`/`WriteFloat`/`WriteBool`
    // write NOTHING when handed null (mirroring SimpleJson), which would
    // otherwise leave a childless Member and a structurally invalid buffer.
    if (this._nodes.length / NODE_WIDTH === index + 1) {
      this._leaf(ProgramNodeTag.Null, 0);
    }
    this._close(index);
  }

  WriteProperty(
    name: string,
    innerOrContent: ((w: ProgramBinaryWriter) => void) | string | boolean | null,
  ): void {
    this.WritePropertyStart(name);
    if (typeof innerOrContent === "function") {
      innerOrContent(this);
    } else {
      this.Write(innerOrContent);
    }
    this.WritePropertyEnd();
  }

  WriteIntProperty(name: string, content: number): void {
    this.WritePropertyStart(name);
    this.WriteInt(content);
    this.WritePropertyEnd();
  }

  WriteFloatProperty(name: string, content: number): void {
    this.WritePropertyStart(name);
    this.WriteFloat(content);
    this.WritePropertyEnd();
  }

  WritePropertyNameStart(): void {
    this._currentPropertyName = "";
  }

  WritePropertyNameInner(str: string): void {
    this._currentPropertyName += str;
  }

  WritePropertyNameEnd(): void {
    this._open.push(
      this._emit(
        ProgramNodeTag.Member,
        this._intern(this._currentPropertyName!),
      ),
    );
    this._currentPropertyName = null;
  }

  Write(value: number | string | boolean | null): void {
    if (value === null || value === undefined) {
      this._leaf(ProgramNodeTag.Null, 0);
    } else if (typeof value === "string") {
      this._leaf(ProgramNodeTag.String, this._intern(value));
    } else if (typeof value === "boolean") {
      this._leaf(value ? ProgramNodeTag.True : ProgramNodeTag.False, 0);
    } else {
      this._leaf(ProgramNodeTag.Number, this._internNumber(value));
    }
  }

  WriteBool(value: boolean | null): void {
    if (value === null) {
      return; // SimpleJson writes nothing for null; see WritePropertyEnd.
    }
    this._leaf(value ? ProgramNodeTag.True : ProgramNodeTag.False, 0);
  }

  WriteInt(value: number | null): void {
    if (value === null) {
      return;
    }
    // Math.floor mirrors SimpleJson exactly: it guarantees savegame
    // compatibility with the reference implementation, so the binary path must
    // not quietly preserve a fractional part the JSON path would drop.
    this._leaf(ProgramNodeTag.Number, this._internNumber(Math.floor(value)));
  }

  WriteFloat(value: number | null): void {
    if (value === null) {
      return;
    }
    // These string markers are load-bearing, not cosmetic: JSON cannot carry
    // Infinity/NaN, and a whole-number float has to survive as `"3.0f"` or the
    // loader recovers it as an IntValue and `7 / 3.0` degrades to integer
    // division. Kept byte-for-byte identical to SimpleJson.Writer.WriteFloat.
    if (value === Number.POSITIVE_INFINITY) {
      this._leaf(ProgramNodeTag.String, this._intern("inff"));
    } else if (value === Number.NEGATIVE_INFINITY) {
      this._leaf(ProgramNodeTag.String, this._intern("-inff"));
    } else if (isNaN(value)) {
      this._leaf(ProgramNodeTag.String, this._intern("nanf"));
    } else if (Number.isInteger(value)) {
      const repr = value.toString();
      this._leaf(
        ProgramNodeTag.String,
        this._intern(repr.includes("e") ? `${repr}f` : `${repr}.0f`),
      );
    } else {
      this._leaf(ProgramNodeTag.Number, this._internNumber(value));
    }
  }

  WriteNull(): void {
    this._leaf(ProgramNodeTag.Null, 0);
  }

  WriteStringStart(): void {
    this._currentString = "";
  }

  WriteStringInner(str: string | null): void {
    if (str === null) {
      return;
    }
    this._currentString += str;
  }

  WriteStringEnd(): void {
    this._leaf(ProgramNodeTag.String, this._intern(this._currentString!));
    this._currentString = null;
  }

  /**
   * Inject a pre-built value as a property of the CURRENT object.
   *
   * `SimpleJson.Writer.InjectObject` assigns into the root object rather than
   * the current collection. `Story.ToJson` only calls it while the root object
   * is the current collection (for `constants` and `structDefs`), so writing a
   * property here is equivalent — and preserves the same key order, which the
   * byte-identity test depends on.
   */
  InjectObject(name: string, obj: unknown): void {
    this.WritePropertyStart(name);
    this._writeValue(obj);
    this.WritePropertyEnd();
  }

  /**
   * Splice a cached flow chunk, or encode a plain JS value inline.
   *
   * The chunk path is the point of phase 2: an unchanged flow costs a bulk
   * record copy rather than a re-walk of the runtime tree.
   */
  WriteInjected(value: unknown): void {
    const pending = this._pendingCapture;
    const start = pending ? this.mark() : 0;
    if (this._isUsableChunk(value)) {
      this._spliceChunk(value);
    } else {
      this._writeValue(value);
    }
    if (pending) {
      this._pendingCapture = null;
      this._captured.set(pending.name, {
        fp: pending.fp,
        chunk: this.captureChunk(start),
      });
    }
  }

  /**
   * Capture the next injected value as flow `name`'s chunk.
   *
   * The flow memo's `resolve` runs BEFORE the caller injects what it returned,
   * so a memo cannot capture the resulting record range itself. It arms the
   * capture here instead, and collects the results afterwards via
   * {@link takeCapturedChunks}.
   */
  captureNextInjectedAs(name: string, fp: string): void {
    this._pendingCapture = { name, fp };
  }

  /** Chunks captured during this serialization, keyed by flow name. */
  takeCapturedChunks(): Map<string, CachedFlowChunk> {
    const captured = this._captured;
    this._captured = new Map();
    return captured;
  }

  /** True if `value` is a chunk minted against THIS table's generation. */
  private _isUsableChunk(value: unknown): value is ProgramChunk {
    return (
      isProgramChunk(value) && value.generation === this._table.generation
    );
  }

  // ------------------------------------------------------- inline JS encoding

  /** Encode a plain JS value as a subtree (the memo-miss path). */
  private _writeValue(value: unknown): void {
    if (value === null || value === undefined) {
      this._leaf(ProgramNodeTag.Null, 0);
    } else if (value === true) {
      this._leaf(ProgramNodeTag.True, 0);
    } else if (value === false) {
      this._leaf(ProgramNodeTag.False, 0);
    } else if (typeof value === "number") {
      this._leaf(ProgramNodeTag.Number, this._internNumber(value));
    } else if (typeof value === "string") {
      this._leaf(ProgramNodeTag.String, this._intern(value));
    } else if (Array.isArray(value)) {
      const index = this._emit(ProgramNodeTag.Array, 0);
      for (const item of value) {
        this._writeValue(item);
      }
      this._close(index);
    } else {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record);
      const index = this._emit(ProgramNodeTag.Object, 0);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i]!;
        const member = this._emit(ProgramNodeTag.Member, this._intern(key));
        this._writeValue(record[key]);
        this._close(member);
      }
      this._close(index);
    }
  }

  // ------------------------------------------------------------------- chunks

  /** Node index the next written value will start at. */
  mark(): number {
    return this._nodes.length / NODE_WIDTH;
  }

  /**
   * Capture the records written since `start`.
   *
   * A straight copy: `size` is already relative and payload pointers are valid
   * for as long as the shared table keeps this generation.
   */
  captureChunk(start: number): ProgramChunk {
    const from = start * NODE_WIDTH;
    const nodes = new Uint32Array(this._nodes.length - from);
    for (let i = 0; i < nodes.length; i += 1) {
      nodes[i] = this._nodes[from + i]!;
    }
    return { nodes, generation: this._table.generation };
  }

  /** Append a chunk's records verbatim. */
  private _spliceChunk(chunk: ProgramChunk): void {
    const src = chunk.nodes;
    for (let i = 0; i < src.length; i += 1) {
      this._nodes.push(src[i]!);
    }
    // Sizes are relative and pointers are table-global, so nothing inside the
    // chunk needs rewriting. Only the width tracker has to notice the chunk's
    // largest slot; the tags themselves are always < 8.
    for (let i = 0; i < src.length; i += NODE_WIDTH) {
      const payload = src[i + 1]!;
      const size = src[i + 2]!;
      if (payload > this._widest) {
        this._widest = payload;
      }
      if (size > this._widest) {
        this._widest = size;
      }
    }
  }

  // -------------------------------------------------------------------- output

  /** The assembled buffer. */
  toBuffer(): ProgramBuffer {
    return {
      nodes:
        this._widest <= 0xffff
          ? Uint16Array.from(this._nodes)
          : Uint32Array.from(this._nodes),
      strings: this._table.strings,
      numbers: Float64Array.from(this._table.numbers),
    };
  }
}

/**
 * Structural test rather than an instanceof/brand check, because a chunk may
 * arrive from a previous compile where class identity does not survive.
 */
export const isProgramChunk = (value: unknown): value is ProgramChunk =>
  !!value &&
  typeof value === "object" &&
  (value as ProgramChunk).nodes instanceof Uint32Array &&
  typeof (value as ProgramChunk).generation === "number";
