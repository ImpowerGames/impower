/**
 * The layout of a statement chunk (docs/engine/binary-program.md, section 1):
 * the compiled form of one statement, an immutable `Int32Array` read in place
 * and never written after it is built.
 *
 * | Words | Holds |
 * | --- | --- |
 * | 0 | code words, two per instruction |
 * | 1 | rows in the line table |
 * | 2 | rows in the export table |
 * | 3 | rows in the block table |
 * | 4 | rows in the reference table |
 * | 5 | chunk id |
 * | 6 to 7 | fingerprint of the statement's source |
 * | 8 to 9 | layout hash of the code and export table |
 * | 10 onwards | the code, then the four tables in the order above |
 */
export type StatementChunk = Int32Array;

export const HEADER_WORDS = 10;

export const H_CODE_WORDS = 0;
export const H_LINE_ROWS = 1;
export const H_EXPORT_ROWS = 2;
export const H_BLOCK_ROWS = 3;
export const H_REFERENCE_ROWS = 4;
export const H_CHUNK_ID = 5;
export const H_FINGERPRINT = 6;
export const H_LAYOUT_HASH = 8;

/** A line table row: the offset of the first instruction it covers, the
 *  anchor its lines count from (-1 for the statement's first line, otherwise
 *  a block index, whose body's end is the anchor), the first line as a delta
 *  from the anchor, the start column, the last line as the same kind of delta,
 *  and the end column. Columns count from 0. */
export const LINE_ROW_WORDS = 6;
/** An export table row: a symbol id and the offset that defines it. */
export const EXPORT_ROW_WORDS = 2;
/** A block table row: the block's sequence id, the resume offset, the break
 *  offset, the scope count and flags, and the lines of the owner's own parts
 *  above the body. */
export const BLOCK_ROW_WORDS = 5;
/** A reference table row: a symbol id and a hash of the facts about it the
 *  emitted code depends on. */
export const REFERENCE_ROW_WORDS = 2;

/** The anchor of a line row that counts from the statement's first line. */
export const ANCHOR_STATEMENT = -1;

/** The fields of a block table row. */
export const B_SEQUENCE = 0;
export const B_RESUME = 1;
export const B_BREAK = 2;
/** The scope count, shifted left by `BLOCK_SCOPE_SHIFT`, beside the flags. */
export const B_SCOPES_FLAGS = 3;
export const B_HEAD_LINES = 4;

/** A block row's flag for a loop's body, which a `Leave` stops at. */
export const BLOCK_LOOP = 1;
/** A block row's flag for a loop body that runs each pass in a scope of its
 *  own, as a `while` body does: the owner opens the scope right before
 *  `EnterBlock`, a `break` or `continue` in the body closes it before its
 *  `Leave`, and the engine closes it when the body's sequence runs out. */
export const BLOCK_PASS_SCOPE = 2;
/** A block row's flag for a function's body, which the function's entry code
 *  enters after binding its parameters (section 10). The owner resumes after
 *  the body at the function's return of nothing. */
export const BLOCK_FUNCTION = 4;
/** A block row's flag for a choice's body, which the choice's entry code
 *  enters (section 4). */
export const BLOCK_CHOICE = 8;
/** A block row's flag for a `choose` block's `then` clause. */
export const BLOCK_THEN = 16;
export const BLOCK_FLAGS_MASK = 0xff;
export const BLOCK_SCOPE_SHIFT = 8;

/** The code words an address can name in one chunk: an address outside the
 *  engine is `chunkId * ADDRESS_OFFSETS + offset` (section 1), so a chunk
 *  with this many code words or more would name another chunk's. */
export const ADDRESS_OFFSETS = 2 ** 21;

/** The address of the instruction at `offset` of the chunk `id`, as a
 *  consumer outside the engine holds it: one number, which a double holds
 *  exactly for 2^32 chunk ids and a consumer compares with `===`
 *  (docs/engine/binary-program.md, section 1, Identity). */
export const addressOf = (id: number, offset: number): number =>
  id * ADDRESS_OFFSETS + offset;

/** The chunk id an address names. */
export const chunkOfAddress = (address: number): number =>
  Math.floor(address / ADDRESS_OFFSETS);

/** The code offset an address names in its chunk. */
export const offsetOfAddress = (address: number): number =>
  address % ADDRESS_OFFSETS;

export const codeWords = (chunk: StatementChunk): number =>
  chunk[H_CODE_WORDS]!;

export const chunkId = (chunk: StatementChunk): number => chunk[H_CHUNK_ID]!;

export const lineTableStart = (chunk: StatementChunk): number =>
  HEADER_WORDS + chunk[H_CODE_WORDS]!;

export const exportTableStart = (chunk: StatementChunk): number =>
  lineTableStart(chunk) + chunk[H_LINE_ROWS]! * LINE_ROW_WORDS;

export const blockTableStart = (chunk: StatementChunk): number =>
  exportTableStart(chunk) + chunk[H_EXPORT_ROWS]! * EXPORT_ROW_WORDS;

export const referenceTableStart = (chunk: StatementChunk): number =>
  blockTableStart(chunk) + chunk[H_BLOCK_ROWS]! * BLOCK_ROW_WORDS;

export const chunkWords = (chunk: StatementChunk): number =>
  referenceTableStart(chunk) + chunk[H_REFERENCE_ROWS]! * REFERENCE_ROW_WORDS;

/** The line table row covering the instruction at `offset` (a code word
 *  index), or -1 when the chunk has no row at or before it. Rows are sorted
 *  by offset, and a row covers the code up to the next row. */
export const lineRowAt = (chunk: StatementChunk, offset: number): number => {
  const start = lineTableStart(chunk);
  const rows = chunk[H_LINE_ROWS]!;
  let found = -1;
  for (let r = 0; r < rows; r += 1) {
    if (chunk[start + r * LINE_ROW_WORDS]! > offset) {
      break;
    }
    found = r;
  }
  return found;
};

/** One field of line table row `row`: 0 offset, 1 anchor, 2 first line,
 *  3 start column, 4 last line, 5 end column. */
export const lineRowField = (
  chunk: StatementChunk,
  row: number,
  field: number,
): number => chunk[lineTableStart(chunk) + row * LINE_ROW_WORDS + field]!;

/** How many symbols the chunk exports. */
export const exportCount = (chunk: StatementChunk): number =>
  chunk[H_EXPORT_ROWS]!;

/** The symbol export row `row` defines. */
export const exportSymbol = (chunk: StatementChunk, row: number): number =>
  chunk[exportTableStart(chunk) + row * EXPORT_ROW_WORDS]!;

/** The offset of the code that defines export row `row`'s symbol. */
export const exportOffset = (chunk: StatementChunk, row: number): number =>
  chunk[exportTableStart(chunk) + row * EXPORT_ROW_WORDS + 1]!;

/** How many blocks the chunk's statement has. */
export const blockCount = (chunk: StatementChunk): number =>
  chunk[H_BLOCK_ROWS]!;

/** One field of block table row `block` (`B_SEQUENCE` and the rest). */
export const blockField = (
  chunk: StatementChunk,
  block: number,
  field: number,
): number => chunk[blockTableStart(chunk) + block * BLOCK_ROW_WORDS + field]!;

/** The scopes the owner has open where it enters block `block`. */
export const blockScopes = (chunk: StatementChunk, block: number): number =>
  blockField(chunk, block, B_SCOPES_FLAGS) >>> BLOCK_SCOPE_SHIFT;

/** What block `block`'s body is (`BLOCK_LOOP` and the rest). */
export const blockFlags = (chunk: StatementChunk, block: number): number =>
  blockField(chunk, block, B_SCOPES_FLAGS) & BLOCK_FLAGS_MASK;
