export type ProgramChunk = Int32Array;

export const HEADER_WORDS = 10;

export const H_CODE_WORDS = 0;
export const H_LINE_ROWS = 1;
export const H_EXPORT_ROWS = 2;
export const H_BLOCK_ROWS = 3;
export const H_REFERENCE_ROWS = 4;
export const H_CHUNK_ID = 5;
export const H_FINGERPRINT = 6;
export const H_LAYOUT_HASH = 8;

export const LINE_ROW_WORDS = 6;
export const EXPORT_ROW_WORDS = 2;
export const BLOCK_ROW_WORDS = 5;
export const REFERENCE_ROW_WORDS = 2;

export const ANCHOR_STATEMENT = -1;

export const B_SEQUENCE = 0;
export const B_RESUME = 1;
export const B_BREAK = 2;
export const B_SCOPES_FLAGS = 3;
export const B_HEAD_LINES = 4;

export const BLOCK_LOOP = 1;
export const BLOCK_PASS_SCOPE = 2;
export const BLOCK_FUNCTION = 4;
export const BLOCK_CHOICE = 8;
export const BLOCK_THEN = 16;
export const BLOCK_FLAGS_MASK = 0xff;
export const BLOCK_SCOPE_SHIFT = 8;

export const ADDRESS_OFFSETS = 2 ** 21;

export const addressOf = (id: number, offset: number): number =>
  id * ADDRESS_OFFSETS + offset;

export const chunkOfAddress = (address: number): number =>
  Math.floor(address / ADDRESS_OFFSETS);

export const offsetOfAddress = (address: number): number =>
  address % ADDRESS_OFFSETS;

export const codeWords = (chunk: ProgramChunk): number =>
  chunk[H_CODE_WORDS]!;

export const chunkId = (chunk: ProgramChunk): number => chunk[H_CHUNK_ID]!;

export const lineTableStart = (chunk: ProgramChunk): number =>
  HEADER_WORDS + chunk[H_CODE_WORDS]!;

export const exportTableStart = (chunk: ProgramChunk): number =>
  lineTableStart(chunk) + chunk[H_LINE_ROWS]! * LINE_ROW_WORDS;

export const blockTableStart = (chunk: ProgramChunk): number =>
  exportTableStart(chunk) + chunk[H_EXPORT_ROWS]! * EXPORT_ROW_WORDS;

export const referenceTableStart = (chunk: ProgramChunk): number =>
  blockTableStart(chunk) + chunk[H_BLOCK_ROWS]! * BLOCK_ROW_WORDS;

export const chunkWords = (chunk: ProgramChunk): number =>
  referenceTableStart(chunk) + chunk[H_REFERENCE_ROWS]! * REFERENCE_ROW_WORDS;

export const lineRowAt = (chunk: ProgramChunk, offset: number): number => {
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

export const lineRowField = (
  chunk: ProgramChunk,
  row: number,
  field: number,
): number => chunk[lineTableStart(chunk) + row * LINE_ROW_WORDS + field]!;

export const exportCount = (chunk: ProgramChunk): number =>
  chunk[H_EXPORT_ROWS]!;

export const exportSymbol = (chunk: ProgramChunk, row: number): number =>
  chunk[exportTableStart(chunk) + row * EXPORT_ROW_WORDS]!;

export const exportOffset = (chunk: ProgramChunk, row: number): number =>
  chunk[exportTableStart(chunk) + row * EXPORT_ROW_WORDS + 1]!;

export const blockCount = (chunk: ProgramChunk): number =>
  chunk[H_BLOCK_ROWS]!;

export const blockField = (
  chunk: ProgramChunk,
  block: number,
  field: number,
): number => chunk[blockTableStart(chunk) + block * BLOCK_ROW_WORDS + field]!;

export const blockScopes = (chunk: ProgramChunk, block: number): number =>
  blockField(chunk, block, B_SCOPES_FLAGS) >>> BLOCK_SCOPE_SHIFT;

export const blockFlags = (chunk: ProgramChunk, block: number): number =>
  blockField(chunk, block, B_SCOPES_FLAGS) & BLOCK_FLAGS_MASK;
