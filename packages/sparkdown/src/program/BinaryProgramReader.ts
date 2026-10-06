import { describeInstruction } from "./BinaryProgramWriter";
import { auxOf, flagsOf, opOf } from "./ProgramInstructions";
import type { ProgramRoot, SequenceRow, SourceRange } from "./ProgramRoot";
import {
  HEADER_WORDS,
  H_LINE_ROWS,
  blockCount,
  codeWords,
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

export type { SourceRange };

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
    return this.root.rangeAt(sequence, entry, offset);
  }

  /** The instructions of every statement of a sequence, one line of text
   *  each, and the statements of each block statement's bodies below it,
   *  indented under `block <k>`, for a test or a coverage report. */
  listing(sequence: SequenceRow, indent = ""): string[] {
    const out: string[] = [];
    for (const { entry, chunk, line } of this.statements(sequence)) {
      out.push(`${indent}${entry} (line ${line + 1}, ${chunk[H_LINE_ROWS]} rows)`);
      for (const { offset } of this.instructions(chunk)) {
        out.push(`${indent}  ${offset}: ${describeInstruction(chunk, offset, this.root.table)}`);
      }
      for (let k = 0; k < blockCount(chunk); k += 1) {
        const body = this.root.body(chunk, k);
        out.push(`${indent}  block ${k}`);
        if (body) {
          out.push(...this.listing(body, `${indent}    `));
        }
      }
    }
    return out;
  }
}
