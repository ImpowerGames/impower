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
