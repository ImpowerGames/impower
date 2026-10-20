// A root by content (`describeRoot`), in a module of its own so that a test
// can read one without loading the program harness, which turns on the chunk
// store's and the resolver's verification for the tests that compile through
// it (`programHarness.ts`).
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { describeInstruction } from "../../program/BinaryProgramWriter";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import { isAnonymousSymbol, SymbolKind } from "../../program/ProgramSymbols";
import {
  B_BREAK,
  B_HEAD_LINES,
  B_RESUME,
  B_SCOPES_FLAGS,
  H_FINGERPRINT,
  H_LAYOUT_HASH,
  H_LINE_ROWS,
  H_REFERENCE_ROWS,
  LINE_ROW_WORDS,
  REFERENCE_ROW_WORDS,
  blockCount,
  blockField,
  chunkId,
  exportCount,
  exportSymbol,
  lineTableStart,
  referenceTableStart,
} from "../../program/ProgramChunk";

/** A root's flow sequences in the order of their names. */
export const flowRows = (root: ProgramRoot) =>
  root
    .flowSequences()
    .sort((a, b) =>
      root.table.symbols[a.flow]!.localeCompare(root.table.symbols[b.flow]!),
    );

/** A root by content: per flow, its kind, script, first line and span; per
 *  statement its line start, its instructions with every id read as what it
 *  names, its line table, its block table without the sequence ids, its
 *  reference table with each symbol read as its name, and its fingerprint
 *  and layout hash; and each body's first line and span, the same way inside
 *  it. The declaration sequences follow, script by script, with the order
 *  the declarations run in. Chunk ids and sequence ids are left out, since
 *  they count every chunk and body a store has made, and so are the ids of
 *  anonymous symbols: a function a statement writes is read as the
 *  fingerprint of the chunk that defines it and its row in that chunk's
 *  export table. */
export function describeRoot(root: ProgramRoot): string[] {
  const reader = new BinaryProgramReader(root);
  const out: string[] = [];
  const symbolName = (symbol: number): string => {
    if (!isAnonymousSymbol(root.table, symbol)) {
      return JSON.stringify(root.table.symbols[symbol]);
    }
    if (root.kindOf(symbol) === SymbolKind.Alternator) {
      return "alternator";
    }
    if (root.kindOf(symbol) === SymbolKind.Choice) {
      return "choice";
    }
    const at = root.definition(symbol);
    const chunk = at ? root.sequence(at.sequence)?.arrays.chunks[at.entry] : undefined;
    if (!chunk) {
      return "function";
    }
    for (let row = 0; row < exportCount(chunk); row += 1) {
      if (exportSymbol(chunk, row) === symbol) {
        return `function@${[...chunk.subarray(H_FINGERPRINT, H_FINGERPRINT + 2)].join(",")}#${row}`;
      }
    }
    return "function";
  };
  const describeSequence = (sequence: SequenceRow, indent: string) => {
    sequence.arrays.chunks.forEach((chunk, entry) => {
      const rows: number[][] = [];
      const start = lineTableStart(chunk);
      for (let r = 0; r < chunk[H_LINE_ROWS]!; r += 1) {
        rows.push([...chunk.subarray(start + r * LINE_ROW_WORDS, start + (r + 1) * LINE_ROW_WORDS)]);
      }
      const blocks: number[][] = [];
      for (let k = 0; k < blockCount(chunk); k += 1) {
        blocks.push([B_RESUME, B_BREAK, B_SCOPES_FLAGS, B_HEAD_LINES].map((f) => blockField(chunk, k, f)));
      }
      const references: string[] = [];
      const refs = referenceTableStart(chunk);
      for (let r = 0; r < chunk[H_REFERENCE_ROWS]!; r += 1) {
        const at = refs + r * REFERENCE_ROW_WORDS;
        references.push(`${symbolName(chunk[at]!)}:${chunk[at + 1]}`);
      }
      out.push(
        `${indent}${sequence.arrays.lineStarts[entry]} ${[...chunk.subarray(H_FINGERPRINT, H_LAYOUT_HASH + 2)].join(",")} rows ${JSON.stringify(rows)} blocks ${JSON.stringify(blocks)} refs [${references.join(" ")}]`,
      );
      for (const { offset } of reader.instructions(chunk)) {
        out.push(
          `${indent}  ${offset}: ${describeInstruction(chunk, offset, root.table, symbolName)}`,
        );
      }
      for (let k = 0; k < blockCount(chunk); k += 1) {
        const body = root.body(chunk, k);
        out.push(`${indent}  block ${k} first ${body ? root.firstLineOf(body) : undefined} span ${body?.span}`);
        if (body) {
          describeSequence(body, `${indent}    `);
        }
      }
    });
  };
  for (const flow of flowRows(root)) {
    out.push(
      `flow ${JSON.stringify(root.table.symbols[flow.flow])} kind ${flow.kind} ${flow.uri} first ${root.firstLineOf(flow)} span ${flow.span}`,
    );
    describeSequence(flow, "  ");
  }
  // The declaration sequences, by script; the bodies of the functions their
  // statements write are described with the statements that own them. A
  // root holds its rows in no order of its own: one built over the previous
  // root keeps the previous root's.
  const scripts = [...root.sequences()]
    .filter((row) => row.flow < 0 && row.owner < 0)
    .sort((a, b) => a.uri.localeCompare(b.uri));
  for (const row of scripts) {
    out.push(`declarations ${row.uri} span ${row.span}`);
    describeSequence(row, "  ");
  }
  out.push(
    `initialization ${root.initialization
      .map((chunk) => {
        const at = root.position(chunkId(chunk));
        return at ? `${at.sequence.uri}#${at.entry}` : "?";
      })
      .join(" ")}`,
  );
  return out;
}
