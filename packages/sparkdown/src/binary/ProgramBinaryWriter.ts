/**
 * A `SimpleJson.Writer`-shaped writer that emits the binary program format
 * directly (#314 phase 2).
 *
 * `Story.ToJson` drives a streaming, SAX-style writer: `WriteObjectStart`,
 * `WritePropertyStart`, `Write`, `WriteArrayEnd` and friends. `SimpleJson.Writer`
 * happens to answer those events by building a JS object tree, which is then
 * stringified. Answering the SAME events by appending `[tag, value, end]`
 * records skips the object tree entirely — so on the path where no flow memo is
 * in play, this does strictly LESS work than the JSON path, not more.
 *
 * ## Why this exists rather than encoding the finished JSON
 *
 * Encoding `writer.toObject()` after the fact means building the tree AND
 * walking it again; measured, that walk is ~9ms of a ~10.6ms encode on the
 * raffles-and-bunny corpus. Consuming the write events removes the second walk
 * and the tree.
 *
 * ## Per-flow chunk reuse
 *
 * `JsonSerialisation.WriteRuntimeContainer` consults a per-flow memo and splices
 * the result via `WriteInjected`. That is the seam the incremental `ToJson`
 * cache already uses. Here `WriteInjected` accepts either:
 *
 *  - a {@link ProgramChunk} — a previously serialized flow, spliced in as raw
 *    records with its indices remapped, no re-serialization; or
 *  - any plain JS value — encoded inline (the memo-miss path, where the engine
 *    hands back a freshly built JS subtree).
 *
 * Chunks store LOCAL string/number tables and chunk-relative `end` offsets, so
 * a chunk is portable across compiles even though the assembled program keeps
 * one compact global table. Splicing remaps a chunk's indices into the global
 * tables: that is O(chunk nodes) integer work (~0.1-0.3ms for the whole
 * program), against ~9ms to re-walk the runtime tree and re-hash its strings.
 */
import {
  NODE_WIDTH,
  ProgramNodeTag,
  type ProgramBuffer,
} from "./programBinary";

/**
 * A serialized top-level flow, portable across compiles.
 *
 * Indices are LOCAL: `value` indexes this chunk's own tables and `end` is
 * relative to the chunk's first record. That is what lets a chunk outlive the
 * program it was produced for — the global tables it was originally interned
 * against will have been rebuilt by the next compile.
 */
export interface ProgramChunk {
  readonly nodes: Uint32Array;
  readonly strings: readonly string[];
  readonly numbers: Float64Array;
}

/** A chunk plus the fingerprint it was valid for. */
export interface CachedFlowChunk {
  readonly fp: string;
  readonly chunk: ProgramChunk;
}

export class ProgramBinaryWriter {
  private _nodes: number[] = [];
  private _strings: string[] = [];
  private _stringIds = new Map<string, number>();
  private _numbers: number[] = [];
  private _numberIds = new Map<number, number>();
  /** Indices of records whose `end` is still unpatched, innermost last. */
  private _open: number[] = [];
  private _widest = 0;
  private _currentString: string | null = null;
  private _currentPropertyName: string | null = null;
  /** Armed by `captureNextInjectedAs`; consumed by the next `WriteInjected`. */
  private _pendingCapture: { name: string; fp: string } | null = null;
  private _captured = new Map<string, CachedFlowChunk>();

  // ---------------------------------------------------------------- interning

  private _intern(text: string): number {
    let id = this._stringIds.get(text);
    if (id === undefined) {
      id = this._strings.length;
      this._strings.push(text);
      this._stringIds.set(text, id);
    }
    return id;
  }

  private _internNumber(n: number): number {
    let id = this._numberIds.get(n);
    if (id === undefined) {
      id = this._numbers.length;
      this._numbers.push(n);
      this._numberIds.set(n, id);
    }
    return id;
  }

  // ------------------------------------------------------------------ records

  /** Append a record, returning its index in RECORDS (not slots). */
  private _emit(tag: ProgramNodeTag, value: number): number {
    const index = this._nodes.length / NODE_WIDTH;
    this._nodes.push(tag, value, 0);
    if (value > this._widest) {
      this._widest = value;
    }
    return index;
  }

  /** Patch a record's `end` to the current write head. */
  private _close(index: number): void {
    const end = this._nodes.length / NODE_WIDTH;
    this._nodes[index * NODE_WIDTH + 2] = end;
    if (end > this._widest) {
      this._widest = end;
    }
  }

  /** A leaf: opens and closes in one step. */
  private _leaf(tag: ProgramNodeTag, value: number): void {
    this._close(this._emit(tag, value));
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
    this._open.push(this._emit(ProgramNodeTag.Member, this._intern(String(name))));
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
      this._emit(ProgramNodeTag.Member, this._intern(this._currentPropertyName!)),
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
   * The chunk path is the point of phase 2: an unchanged flow costs a remap of
   * its records rather than a re-walk of the runtime tree.
   */
  WriteInjected(value: unknown): void {
    const pending = this._pendingCapture;
    const start = pending ? this.mark() : 0;
    if (isProgramChunk(value)) {
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
   * Capture the records written since `start` as a portable chunk.
   *
   * Rewrites into LOCAL tables and chunk-relative `end` offsets, so the chunk
   * survives into a later compile whose global tables are interned differently.
   */
  captureChunk(start: number): ProgramChunk {
    const end = this._nodes.length / NODE_WIDTH;
    const count = end - start;
    const nodes = new Uint32Array(count * NODE_WIDTH);
    const strings: string[] = [];
    const stringRemap = new Map<number, number>();
    const numbers: number[] = [];
    const numberRemap = new Map<number, number>();

    for (let i = 0; i < count; i += 1) {
      const src = (start + i) * NODE_WIDTH;
      const dst = i * NODE_WIDTH;
      const tag = this._nodes[src]! as ProgramNodeTag;
      const value = this._nodes[src + 1]!;
      nodes[dst] = tag;
      if (tag === ProgramNodeTag.String || tag === ProgramNodeTag.Member) {
        let local = stringRemap.get(value);
        if (local === undefined) {
          local = strings.length;
          strings.push(this._strings[value]!);
          stringRemap.set(value, local);
        }
        nodes[dst + 1] = local;
      } else if (tag === ProgramNodeTag.Number) {
        let local = numberRemap.get(value);
        if (local === undefined) {
          local = numbers.length;
          numbers.push(this._numbers[value]!);
          numberRemap.set(value, local);
        }
        nodes[dst + 1] = local;
      } else {
        nodes[dst + 1] = value;
      }
      nodes[dst + 2] = this._nodes[src + 2]! - start;
    }

    return { nodes, strings, numbers: Float64Array.from(numbers) };
  }

  /** Append a chunk's records, remapping its local indices into ours. */
  private _spliceChunk(chunk: ProgramChunk): void {
    const base = this._nodes.length / NODE_WIDTH;
    const stringBase: number[] = new Array(chunk.strings.length);
    for (let i = 0; i < chunk.strings.length; i += 1) {
      stringBase[i] = this._intern(chunk.strings[i]!);
    }
    const numberBase: number[] = new Array(chunk.numbers.length);
    for (let i = 0; i < chunk.numbers.length; i += 1) {
      numberBase[i] = this._internNumber(chunk.numbers[i]!);
    }
    const src = chunk.nodes;
    const count = src.length / NODE_WIDTH;
    for (let i = 0; i < count; i += 1) {
      const o = i * NODE_WIDTH;
      const tag = src[o]! as ProgramNodeTag;
      const value = src[o + 1]!;
      const mapped =
        tag === ProgramNodeTag.String || tag === ProgramNodeTag.Member
          ? stringBase[value]!
          : tag === ProgramNodeTag.Number
            ? numberBase[value]!
            : value;
      const end = src[o + 2]! + base;
      this._nodes.push(tag, mapped, end);
      if (mapped > this._widest) {
        this._widest = mapped;
      }
      if (end > this._widest) {
        this._widest = end;
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
      strings: this._strings,
      numbers: Float64Array.from(this._numbers),
    };
  }
}

/**
 * Structural test rather than an instanceof/brand check, because a chunk may
 * arrive from a previous compile (and, later, across a worker boundary) where
 * class identity does not survive.
 */
export const isProgramChunk = (value: unknown): value is ProgramChunk =>
  !!value &&
  typeof value === "object" &&
  (value as ProgramChunk).nodes instanceof Uint32Array &&
  Array.isArray((value as ProgramChunk).strings) &&
  (value as ProgramChunk).numbers instanceof Float64Array;
