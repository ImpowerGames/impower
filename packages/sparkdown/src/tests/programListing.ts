import { BinaryProgramReader } from "../program/BinaryProgramReader";
import { describeInstruction } from "../program/BinaryProgramWriter";
import { ProgramRoot, type SequenceRow } from "../program/ProgramRoot";
import { SymbolKind } from "../program/ProgramSymbols";
import { blockCount, type ProgramChunk } from "../program/ProgramChunk";
import { describeRoot } from "./program/describeRoot";

export function rootOf(root: ProgramRoot | undefined): ProgramRoot {
  if (!(root instanceof ProgramRoot)) {
    throw new Error("The compile built no statement chunks.");
  }
  return root;
}

function chunkListing(
  root: ProgramRoot,
  reader: BinaryProgramReader,
  chunk: ProgramChunk,
  out: string[],
): void {
  for (const { offset } of reader.instructions(chunk)) {
    out.push(describeInstruction(chunk, offset, root.table));
  }
  for (let k = 0; k < blockCount(chunk); k += 1) {
    const body = root.body(chunk, k);
    if (body) {
      sequenceListing(root, reader, body, out);
    }
  }
}

function sequenceListing(
  root: ProgramRoot,
  reader: BinaryProgramReader,
  sequence: SequenceRow,
  out: string[],
): void {
  for (const chunk of sequence.arrays.chunks) {
    chunkListing(root, reader, chunk, out);
  }
}

export function flowListings(chunks: ProgramRoot | undefined): Map<string, string[]> {
  const root = rootOf(chunks);
  const reader = new BinaryProgramReader(root);
  const listings = new Map<string, string[]>();
  for (const flow of root.flowSequences()) {
    const out: string[] = [];
    sequenceListing(root, reader, flow, out);
    listings.set(root.table.symbols[flow.flow] ?? "", out);
  }
  return listings;
}

export function programListing(chunks: ProgramRoot | undefined): string[] {
  const root = rootOf(chunks);
  const reader = new BinaryProgramReader(root);
  const out = [...flowListings(root).values()].flat();
  for (const chunk of root.initialization) {
    chunkListing(root, reader, chunk, out);
  }
  return out;
}

export function programContent(chunks: ProgramRoot | undefined): string[] {
  return describeRoot(rootOf(chunks));
}

export function functionSpans(program: {
  chunks?: ProgramRoot;
  scripts: Record<string, number>;
}): { path: string; lines: [number, number, number] }[] {
  const root = rootOf(program.chunks);
  const scripts = Object.keys(program.scripts);
  return root
    .flowSequences()
    .filter((row) => row.kind === SymbolKind.Function)
    .map((row) => {
      const first = root.firstLineOf(row);
      return {
        path: root.table.symbols[row.flow] ?? "",
        lines: [scripts.indexOf(row.uri), first, first + row.span - 1] as [
          number,
          number,
          number,
        ],
      };
    })
    .sort((a, b) => a.lines[0] - b.lines[0] || a.lines[1] - b.lines[1]);
}

export const pushesString = (listing: readonly string[], text: string) =>
  listing.includes(`Str ${JSON.stringify(text)}`);

export const stringCount = (listing: readonly string[], text: string) =>
  listing.filter((line) => line === `Str ${JSON.stringify(text)}`).length;
