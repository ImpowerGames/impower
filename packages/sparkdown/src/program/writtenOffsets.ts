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

export function writtenOffset(
  chunk: ProgramChunk,
  strings: readonly string[],
  offset: number,
): number {
  let written = 0;
  for (let at = 0; at < offset && at < codeWords(chunk); at += 2) {
    if (writes(chunk, strings, at)) written += 2;
  }
  return written;
}

export function codeOffset(
  chunk: ProgramChunk,
  strings: readonly string[],
  written: number,
): number {
  const words = codeWords(chunk);
  let at = 0;
  for (let count = 0; count < written && at < words; at += 2) {
    if (writes(chunk, strings, at)) count += 2;
  }
  return at;
}
