/**
 * Binary encoding for the compiled program (#314, phase 1).
 *
 * The compiled program travels as ink JSON: the compiler stringifies it, the
 * host structured-clones it, and the player parses it back. On the
 * raffles-and-bunny corpus that is ~417KB of bytecode inside a ~1.5MB program
 * (`JSON.stringify` of the whole program costs ~21ms; of the bytecode slice
 * alone, ~5.4ms to write and ~5.7ms to parse back).
 *
 * ## Shape: a flat node buffer, not a nested encoding
 *
 * Modelled on lezer's `TreeBuffer` (the same structure this repo's
 * `textmate-grammar-tree` builds parse trees with): every node is a
 * fixed-width record in one contiguous typed array, and a subtree is a
 * CONTIGUOUS RANGE of that array. A recursive tagged encoding would have been
 * simpler, but it forces the decoder to materialize a JS object tree — which
 * merely replaces `JSON.parse` with a bespoke parse and keeps the allocation
 * cost. This layout is what makes the rest of the ticket work:
 *
 *  - **Iterable in place.** A consumer walks it with an integer cursor and
 *    allocates nothing, so a `SharedArrayBuffer` genuinely removes the
 *    transfer cost instead of relocating it (ticket phase 4).
 *  - **Subtrees are spans.** `end` is the index one past a node's last
 *    descendant, so skipping a subtree is one assignment, and a top-level
 *    flow's serialized form is a slice — which is what phase 2 needs to keep
 *    the incremental `ToJson` flow memo alive.
 *  - **Repetition collapses.** Ink bytecode is overwhelmingly repeated short
 *    strings (`ev`, `/ev`, `^`, `done`, `#`, `/#`, and every `{"VAR?":…}`
 *    key); they are interned once and referenced by index.
 *
 * Key ORDER is preserved, so a decoded program re-stringifies byte-identically
 * to the original — that equality is the round-trip test.
 *
 * ## Layout
 *
 * ```
 * header   magic "SDB\x03" | nodeCount | stringCount | doubleCount | slotBytes
 * nodes    NODE_WIDTH slots per node: [tag, value, end]
 * numbers  Float64Array (every numeric payload, deduped, by index)
 * strings  length table (Int32) + UTF-8 blob (interned, referenced by index)
 * ```
 *
 * Sections are padded so each starts at a multiple of its own element size,
 * which is what lets them be read back as views instead of copies.
 *
 * `value` is always an INDEX, never a payload: into `numbers` for Number,
 * into `strings` for String and for a Member's key. `end` indexes the node
 * array, in RECORDS, one past the last descendant.
 */

/** `SDB` + format version. Bump the last byte on any incompatible change. */
export const PROGRAM_BINARY_MAGIC = new Uint8Array([0x53, 0x44, 0x42, 0x03]);

/**
 * Slots per node record: `[tag, payload, size]`.
 *
 * `size` is lezer's fourth value — "the amount of space taken up in the array
 * by this node and its children", counted in RECORDS including the node
 * itself. It is deliberately a SIZE and not an end index, because a size is
 * intrinsic to the node while an end index is a statement about where the node
 * sits. That single difference is what makes a subtree relocatable: skipping
 * one is `i += size` instead of `i = end`, and splicing a cached subtree needs
 * no structural rewrite at all.
 *
 * lezer carries `from`/`to` document offsets in its other two slots; we have no
 * use for those, so the record stays three wide — the payload slot is a
 * pointer into the string or number table, never an inline value.
 */
export const NODE_WIDTH = 3;

export const enum ProgramNodeTag {
  Null = 0,
  False = 1,
  True = 2,
  /** `value` indexes the numbers table. */
  Number = 3,
  /** `value` indexes the strings table. */
  String = 4,
  Array = 5,
  Object = 6,
  /**
   * One object entry. `value` is the key's string index and it has exactly one
   * child (the entry's value). Modelling members as nodes keeps every record
   * fixed-width, so the buffer stays a flat array a cursor can scan.
   */
  Member = 7,
}

export interface ProgramBuffer {
  /**
   * `NODE_WIDTH` slots per node; a subtree is the range `[i, node.end)`.
   *
   * 16-bit when every slot fits, 32-bit otherwise — measured on the R&B
   * corpus, ink bytecode is ~33k nodes whose largest slot is well under
   * 65,535, and halving the record is the difference between this format
   * being larger than the JSON it replaces and being smaller. The width is
   * recorded in the header, so a story big enough to overflow simply widens
   * rather than failing.
   */
  readonly nodes: Uint16Array | Uint32Array;
  readonly strings: readonly string[];
  /**
   * Every numeric payload, deduplicated. Numbers live here rather than inline
   * so a node slot only ever holds a tag, a table index, or a node index —
   * all bounded by STRUCTURE size. Inline values would let one large integer
   * force the whole node array from 16 to 32 bits.
   */
  readonly numbers: Float64Array;
}

/** Build the flat node buffer for a JSON value. */
export const buildProgramBuffer = (value: unknown): ProgramBuffer => {
  const nodes: number[] = [];
  const strings: string[] = [];
  const stringIds = new Map<string, number>();
  const numbers: number[] = [];
  const numberIds = new Map<number, number>();

  const intern = (text: string): number => {
    let id = stringIds.get(text);
    if (id === undefined) {
      id = strings.length;
      strings.push(text);
      stringIds.set(text, id);
    }
    return id;
  };

  const internNumber = (n: number): number => {
    // `0`, `1`, `2` and friends recur constantly in bytecode, so dedupe.
    // Keyed on the value; -0 and 0 collide harmlessly (JSON has no -0).
    let id = numberIds.get(n);
    if (id === undefined) {
      id = numbers.length;
      numbers.push(n);
      numberIds.set(n, id);
    }
    return id;
  };

  // Tracked as we go rather than by re-scanning every slot afterwards; only
  // payload pointers and sizes can be large, tags are always < 8.
  let widest = 0;

  /** Emit a record, returning its index in RECORDS (not ints). */
  const emit = (tag: ProgramNodeTag, nodeValue: number): number => {
    const index = nodes.length / NODE_WIDTH;
    nodes.push(tag, nodeValue, 0);
    if (nodeValue > widest) {
      widest = nodeValue;
    }
    return index;
  };

  /** Patch the subtree SIZE once the whole subtree has been written. */
  const close = (index: number) => {
    const size = nodes.length / NODE_WIDTH - index;
    nodes[index * NODE_WIDTH + 2] = size;
    if (size > widest) {
      widest = size;
    }
  };

  const write = (node: unknown): void => {
    if (node === null || node === undefined) {
      close(emit(ProgramNodeTag.Null, 0));
    } else if (node === true) {
      close(emit(ProgramNodeTag.True, 0));
    } else if (node === false) {
      close(emit(ProgramNodeTag.False, 0));
    } else if (typeof node === "number") {
      close(emit(ProgramNodeTag.Number, internNumber(node)));
    } else if (typeof node === "string") {
      close(emit(ProgramNodeTag.String, intern(node)));
    } else if (Array.isArray(node)) {
      const index = emit(ProgramNodeTag.Array, 0);
      for (const item of node) {
        write(item);
      }
      close(index);
    } else {
      const record = node as Record<string, unknown>;
      // Object.keys, not Object.entries: entries allocates a [key, value] pair
      // array per object on top of the key array, and the program is mostly
      // small objects. Own enumerable keys, matching JSON.stringify's set.
      const keys = Object.keys(record);
      const index = emit(ProgramNodeTag.Object, 0);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!;
        const memberIndex = emit(ProgramNodeTag.Member, intern(key));
        write(record[key]);
        close(memberIndex);
      }
      close(index);
    }
  };
  write(value);

  return {
    nodes:
      widest <= 0xffff ? Uint16Array.from(nodes) : Uint32Array.from(nodes),
    strings,
    numbers: Float64Array.from(numbers),
  };
};

/**
 * Materialize a node (and its subtree) back into a plain JSON value.
 *
 * The fallback/equivalence path. Consumers that care about speed should walk
 * the buffer directly rather than calling this — not allocating this tree is
 * the entire point of the layout.
 */
export const materializeNode = (
  buffer: ProgramBuffer,
  index = 0,
): unknown => {
  const { nodes, strings, numbers } = buffer;
  const base = index * NODE_WIDTH;
  const tag = nodes[base] as ProgramNodeTag;
  const value = nodes[base + 1]!;
  switch (tag) {
    case ProgramNodeTag.Null:
      return null;
    case ProgramNodeTag.True:
      return true;
    case ProgramNodeTag.False:
      return false;
    case ProgramNodeTag.Number:
      return numbers[value]!;
    case ProgramNodeTag.String:
      return strings[value]!;
    case ProgramNodeTag.Array: {
      const items: unknown[] = [];
      // Children are laid out consecutively; hopping a child's SIZE lands on
      // the next sibling, so this walks siblings without recursing into them.
      let child = index + 1;
      const end = index + nodes[base + 2]!;
      while (child < end) {
        items.push(materializeNode(buffer, child));
        child += nodes[child * NODE_WIDTH + 2]!;
      }
      return items;
    }
    case ProgramNodeTag.Object: {
      const result: Record<string, unknown> = {};
      let child = index + 1;
      const end = index + nodes[base + 2]!;
      while (child < end) {
        // Every child of an Object is a Member: key in `value`, one child.
        const key = strings[nodes[child * NODE_WIDTH + 1]!]!;
        result[key] = materializeNode(buffer, child + 1);
        child += nodes[child * NODE_WIDTH + 2]!;
      }
      return result;
    }
    case ProgramNodeTag.Member:
      // A Member is only reachable through its Object parent above.
      return materializeNode(buffer, index + 1);
    default:
      throw new Error(`Unknown tag ${tag} in sparkdown binary program`);
  }
};

const HEADER_INTS = 4; // nodeCount, stringCount, doubleCount, slotBytes

/**
 * Encode the string table into one contiguous blob plus a length table.
 *
 * A `TextEncoder.encode()` per string allocates a `Uint8Array` per string, and
 * with a few thousand short bytecode tokens those allocations — not the
 * encoding — dominate: measured 7.9ms per-string vs 1.8ms into a single
 * buffer for the same strings. Nearly every ink token is ASCII, so that path
 * skips the encoder entirely and just widens the code units.
 */
const encodeStringTable = (
  strings: readonly string[]
): { data: Uint8Array; lengths: Int32Array } => {
  const lengths = new Int32Array(strings.length);
  // UTF-8 never exceeds 3 bytes per UTF-16 code unit (a surrogate pair is two
  // units and four bytes, so it stays under the bound), which lets us write
  // into one scratch buffer before we know the exact size.
  let bound = 0;
  for (const s of strings) {
    bound += s.length * 3;
  }
  const data = new Uint8Array(bound);
  const encoder = new TextEncoder();
  let cursor = 0;
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i]!;
    const start = cursor;
    let ascii = true;
    for (let c = 0; c < s.length; c++) {
      const code = s.charCodeAt(c);
      if (code > 0x7f) {
        ascii = false;
        break;
      }
      data[start + c] = code;
    }
    // On the fallback the partial ASCII bytes above are simply overwritten,
    // since encodeInto starts at the same offset.
    cursor = ascii
      ? start + s.length
      : start + encoder.encodeInto(s, data.subarray(start)).written;
    lengths[i] = cursor - start;
  }
  return { data: data.subarray(0, cursor), lengths };
};

/** Serialize a compiled program (or any JSON value) to one buffer. */
export const encodeProgram = (value: unknown): Uint8Array =>
  encodeProgramBuffer(buildProgramBuffer(value));

/**
 * Serialize an already-built buffer.
 *
 * Split out from {@link encodeProgram} so a writer that produced its records
 * directly (`ProgramBinaryWriter`) does not have to build a JS value first,
 * only to have it walked a second time.
 */
export const encodeProgramBuffer = (buffer: ProgramBuffer): Uint8Array => {
  const { nodes, strings, numbers } = buffer;
  const slotBytes = nodes.BYTES_PER_ELEMENT;
  const { data: stringData, lengths: stringLengths } =
    encodeStringTable(strings);
  const stringBytes = stringData.length;

  const magic = PROGRAM_BINARY_MAGIC.length;
  // Keep every typed-array section aligned to its own element size, so a
  // consumer can subarray them out of a SharedArrayBuffer without copying.
  const headerBytes = magic + HEADER_INTS * 4;
  const nodeBytes = nodes.length * slotBytes;
  const numberOffset = align(headerBytes + nodeBytes, 8);
  const stringLenOffset = numberOffset + numbers.length * 8;
  const stringDataOffset = stringLenOffset + strings.length * 4;
  const total = stringDataOffset + stringBytes;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set(PROGRAM_BINARY_MAGIC, 0);
  view.setInt32(magic, nodes.length / NODE_WIDTH, true);
  view.setInt32(magic + 4, strings.length, true);
  view.setInt32(magic + 8, numbers.length, true);
  view.setInt32(magic + 12, slotBytes, true);
  if (slotBytes === 2) {
    new Uint16Array(out.buffer, headerBytes, nodes.length).set(nodes);
  } else {
    new Uint32Array(out.buffer, headerBytes, nodes.length).set(nodes);
  }
  new Float64Array(out.buffer, numberOffset, numbers.length).set(numbers);
  new Int32Array(out.buffer, stringLenOffset, strings.length).set(stringLengths);
  out.set(stringData, stringDataOffset);
  return out;
};

const align = (offset: number, to: number) =>
  offset % to === 0 ? offset : offset + (to - (offset % to));

/** True if `bytes` carries this format's magic. */
export const isProgramBinary = (bytes: Uint8Array): boolean =>
  bytes.length >= PROGRAM_BINARY_MAGIC.length &&
  PROGRAM_BINARY_MAGIC.every((byte, i) => bytes[i] === byte);

/**
 * Read the sections back out. The node and double arrays are VIEWS onto the
 * caller's bytes — no copy — which is what a shared buffer needs.
 */
export const readProgramBuffer = (input: Uint8Array): ProgramBuffer => {
  if (!isProgramBinary(input)) {
    throw new Error(
      "Not a sparkdown binary program (bad magic). Callers are responsible for choosing the JSON path when this format isn't in use.",
    );
  }
  // Every section is laid out aligned relative to the START of the message, so
  // a message sitting at an unaligned offset inside a larger buffer (a framed
  // or sliced payload) would make the Float64Array/Uint16Array constructors
  // throw a bare RangeError. A transferred buffer is always offset 0, so this
  // copies only in the case that would otherwise crash.
  const bytes =
    input.byteOffset % 8 === 0 ? input : new Uint8Array(input.slice());
  const magic = PROGRAM_BINARY_MAGIC.length;
  const base = bytes.byteOffset;
  const view = new DataView(bytes.buffer, base, bytes.byteLength);
  const nodeCount = view.getInt32(magic, true);
  const stringCount = view.getInt32(magic + 4, true);
  const numberCount = view.getInt32(magic + 8, true);
  const slotBytes = view.getInt32(magic + 12, true);

  const headerBytes = magic + HEADER_INTS * 4;
  const nodeBytes = nodeCount * NODE_WIDTH * slotBytes;
  const numberOffset = align(headerBytes + nodeBytes, 8);
  const stringLenOffset = numberOffset + numberCount * 8;
  const stringDataOffset = stringLenOffset + stringCount * 4;

  const nodes =
    slotBytes === 2
      ? new Uint16Array(
          bytes.buffer,
          base + headerBytes,
          nodeCount * NODE_WIDTH,
        )
      : new Uint32Array(
          bytes.buffer,
          base + headerBytes,
          nodeCount * NODE_WIDTH,
        );
  const numbers = new Float64Array(
    bytes.buffer,
    base + numberOffset,
    numberCount,
  );
  const lengths = new Int32Array(
    bytes.buffer,
    base + stringLenOffset,
    stringCount,
  );
  const decoder = new TextDecoder();
  const strings: string[] = new Array(stringCount);
  let cursor = base + stringDataOffset;
  for (let i = 0; i < stringCount; i += 1) {
    const length = lengths[i]!;
    strings[i] = decoder.decode(
      new Uint8Array(bytes.buffer, cursor, length),
    );
    cursor += length;
  }
  return { nodes, strings, numbers };
};

/** Decode bytes produced by {@link encodeProgram} back to a JSON value. */
export const decodeProgram = <T = unknown>(bytes: Uint8Array): T =>
  materializeNode(readProgramBuffer(bytes)) as T;

/**
 * A program carrying bytecode in EITHER representation.
 *
 * Typed structurally rather than as `SparkProgram`, because `SparkProgram`
 * imports `ProgramBuffer` from this module and the reverse import would be a
 * cycle.
 */
export interface CompiledProgramLike {
  compiled?: Record<string, any>;
  compiledBuffer?: ProgramBuffer;
}

/**
 * True if the program has runnable bytecode, whichever form it arrived in.
 *
 * Call sites used to test `program.compiled` for truthiness as a readiness
 * gate; with the binary path those gates must accept the buffer too, or a
 * perfectly good program reads as "not compiled yet".
 */
export const hasCompiledProgram = (
  program: CompiledProgramLike | undefined | null,
): boolean => Boolean(program && (program.compiled || program.compiledBuffer));

/**
 * The program's bytecode as a JS object tree, materializing the binary form.
 *
 * `new Story(...)` walks a plain object tree, so the binary form has to be
 * materialized at that boundary. Materializing is still cheaper than what it
 * replaces: the object graph no longer crosses the worker hop as a structured
 * clone, only the typed arrays and the string table do.
 *
 * Not memoized — callers materialize once and keep the result (see
 * `Game.updateProgram`), because caching onto the program would mutate an
 * object the compiler retains for its no-change short-circuit.
 */
export const resolveCompiledProgram = (
  program: CompiledProgramLike | undefined | null,
): Record<string, any> | undefined => {
  if (!program) {
    return undefined;
  }
  if (program.compiled) {
    return program.compiled;
  }
  if (program.compiledBuffer) {
    return materializeNode(program.compiledBuffer) as Record<string, any>;
  }
  return undefined;
};
