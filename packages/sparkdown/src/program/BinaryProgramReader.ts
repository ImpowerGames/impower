import { describeInstruction } from "./BinaryProgramWriter";
import { auxOf, flagsOf, opOf } from "./ProgramInstructions";
import type { ProgramRoot, SequenceRow } from "./ProgramRoot";
import {
  ANCHOR_STATEMENT,
  HEADER_WORDS,
  H_LINE_ROWS,
  LINE_ROW_WORDS,
  codeWords,
  lineRowAt,
  lineTableStart,
  type StatementChunk,
} from "./StatementChunk";

/** One instruction as the reader decodes it. */
export interface Instruction {
  /** The offset of the instruction's first word in the chunk's code. */
  offset: number;
  op: number;
  flags: number;
  aux: number;
  arg: number;
}

/** A source range as a line table row gives it, with lines and columns
 *  counting from 0 in the statement's script. */
export interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * `BinaryProgramReader` iterates a flow's chunks and a chunk's instructions
 * in place, as a Lezer cursor does over a tree (docs/engine/binary-program.md,
 * section 9): nothing is constructed when a root arrives. The engine reads the
 * code words the same way through its integer cursor; the reader serves every
 * other consumer, and the line table.
 */
export class BinaryProgramReader {
  constructor(readonly root: ProgramRoot) {}

  /** The chunks of a sequence, with each one's entry and first line in its
   *  script (counting from 0). */
  *statements(
    sequence: SequenceRow,
  ): IterableIterator<{ entry: number; chunk: StatementChunk; line: number }> {
    const { chunks } = sequence.arrays;
    for (let entry = 0; entry < chunks.length; entry += 1) {
      yield { entry, chunk: chunks[entry]!, line: this.root.lineOf(sequence, entry) };
    }
  }

  /** The instructions of a chunk's code, in order. */
  *instructions(chunk: StatementChunk): IterableIterator<Instruction> {
    const words = codeWords(chunk);
    for (let offset = 0; offset < words; offset += 2) {
      yield BinaryProgramReader.instructionAt(chunk, offset);
    }
  }

  static instructionAt(chunk: StatementChunk, offset: number): Instruction {
    const w0 = chunk[HEADER_WORDS + offset]!;
    return {
      offset,
      op: opOf(w0),
      flags: flagsOf(w0),
      aux: auxOf(w0),
      arg: chunk[HEADER_WORDS + offset + 1]!,
    };
  }

  /** The source range of the instruction at `offset` of the statement at
   *  `entry` of `sequence`: the line table row that covers it, placed at the
   *  statement's first line. */
  rangeAt(
    sequence: SequenceRow,
    entry: number,
    offset: number,
  ): SourceRange | null {
    const chunk = sequence.arrays.chunks[entry];
    if (!chunk) {
      return null;
    }
    const row = lineRowAt(chunk, offset);
    if (row < 0) {
      return null;
    }
    const at = lineTableStart(chunk) + row * LINE_ROW_WORDS;
    if (chunk[at + 1] !== ANCHOR_STATEMENT) {
      return null;
    }
    const first = this.root.lineOf(sequence, entry);
    return {
      startLine: first + chunk[at + 2]!,
      startColumn: chunk[at + 3]!,
      endLine: first + chunk[at + 4]!,
      endColumn: chunk[at + 5]!,
    };
  }

  /** The instructions of every statement of a flow, one line of text each,
   *  for a test or a coverage report. */
  listing(sequence: SequenceRow): string[] {
    const out: string[] = [];
    for (const { entry, chunk, line } of this.statements(sequence)) {
      out.push(`${entry} (line ${line + 1}, ${chunk[H_LINE_ROWS]} rows)`);
      for (const { offset } of this.instructions(chunk)) {
        out.push(`  ${offset}: ${describeInstruction(chunk, offset, this.root.table)}`);
      }
    }
    return out;
  }
}
