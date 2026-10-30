import { describeInstruction } from "./BinaryProgramWriter";
import { auxOf, flagsOf, opOf } from "./ProgramInstructions";
import type { ProgramRoot, SequenceRow, SourceRange } from "./ProgramRoot";
import {
  HEADER_WORDS,
  H_LINE_ROWS,
  blockCount,
  codeWords,
  type ProgramChunk,
} from "./ProgramChunk";

export interface Instruction {
  offset: number;
  op: number;
  flags: number;
  aux: number;
  arg: number;
}

export type { SourceRange };

export class BinaryProgramReader {
  constructor(readonly root: ProgramRoot) {}

  *statements(
    sequence: SequenceRow,
  ): IterableIterator<{ entry: number; chunk: ProgramChunk; line: number }> {
    const { chunks } = sequence.arrays;
    for (let entry = 0; entry < chunks.length; entry += 1) {
      yield { entry, chunk: chunks[entry]!, line: this.root.lineOf(sequence, entry) };
    }
  }

  *instructions(chunk: ProgramChunk): IterableIterator<Instruction> {
    const words = codeWords(chunk);
    for (let offset = 0; offset < words; offset += 2) {
      yield BinaryProgramReader.instructionAt(chunk, offset);
    }
  }

  static instructionAt(chunk: ProgramChunk, offset: number): Instruction {
    const w0 = chunk[HEADER_WORDS + offset]!;
    return {
      offset,
      op: opOf(w0),
      flags: flagsOf(w0),
      aux: auxOf(w0),
      arg: chunk[HEADER_WORDS + offset + 1]!,
    };
  }

  rangeAt(
    sequence: SequenceRow,
    entry: number,
    offset: number,
  ): SourceRange | null {
    return this.root.rangeAt(sequence, entry, offset);
  }

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
