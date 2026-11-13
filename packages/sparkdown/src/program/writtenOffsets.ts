import { writesNothing } from "../runtime/displayStyle";
import { codeWords, HEADER_WORDS, type ProgramChunk } from "./ProgramChunk";
import { Op, opOf } from "./ProgramInstructions";

const writes = (
  chunk: ProgramChunk,
  strings: readonly string[],
  offset: number,
): boolean =>
  opOf(chunk[HEADER_WORDS + offset]!) !== Op.Text ||
  !writesNothing(strings[chunk[HEADER_WORDS + offset + 1]!] ?? "");

export interface WrittenOffset {
  written: number;
  unwritten: number;
}

export function writtenOffset(
  chunk: ProgramChunk,
  strings: readonly string[],
  offset: number,
): WrittenOffset {
  let written = 0;
  let unwritten = 0;
  for (let at = 0; at < offset && at < codeWords(chunk); at += 2) {
    if (writes(chunk, strings, at)) {
      written += 2;
      unwritten = 0;
    } else {
      unwritten += 1;
    }
  }
  return { written, unwritten };
}

export function codeOffset(
  chunk: ProgramChunk,
  strings: readonly string[],
  { written, unwritten }: WrittenOffset,
): number {
  const words = codeWords(chunk);
  let at = 0;
  for (let count = 0; count < written && at < words; at += 2) {
    if (writes(chunk, strings, at)) count += 2;
  }
  for (let k = 0; k < unwritten && at < words && !writes(chunk, strings, at); k += 1) {
    at += 2;
  }
  return at;
}
