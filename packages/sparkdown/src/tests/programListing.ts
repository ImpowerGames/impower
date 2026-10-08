// What a chunked compile holds, as text a test can search: each instruction
// of each chunk read by `describeInstruction` (`Str "glue"`, `CallStd
// display/1 flags 3`, `JumpSym "two"`), flow by flow. A test that asserted on
// the current engine's compiled JSON (the containers a flow held, the markers
// a display table carried) asserts the same of the program's chunks (#705).
import { BinaryProgramReader } from "../program/BinaryProgramReader";
import { describeInstruction } from "../program/BinaryProgramWriter";
import type { ProgramRoot, SequenceRow } from "../program/ProgramRoot";
import { blockCount, type StatementChunk } from "../program/StatementChunk";
import { testRoot } from "./engineUnderTest";

/** The root of a test compile's `program.compiled`; a compile that made no
 *  root (one that fell back, or failed) fails the test that reads it. */
export function rootOf(compiled: unknown): ProgramRoot {
  const root = testRoot(compiled);
  if (!root) {
    throw new Error("The compile built no statement chunks.");
  }
  return root;
}

/** The instructions of a chunk and of the bodies it enters (a block's, a
 *  function's a statement writes), in order. */
function chunkListing(
  root: ProgramRoot,
  reader: BinaryProgramReader,
  chunk: StatementChunk,
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

/** The instructions of a sequence's chunks and of the bodies they enter, in
 *  order. */
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

/** Each flow's instructions by the flow's qualified name (`""` for the top
 *  level, a scene's name, `scene.branch`, a function's name), with those of
 *  the bodies its statements enter. */
export function flowListings(compiled: unknown): Map<string, string[]> {
  const root = rootOf(compiled);
  const reader = new BinaryProgramReader(root);
  const listings = new Map<string, string[]>();
  for (const flow of root.flowSequences()) {
    const out: string[] = [];
    sequenceListing(root, reader, flow, out);
    listings.set(root.table.symbols[flow.flow] ?? "", out);
  }
  return listings;
}

/** Every instruction of the program: its flows', and its declarations' with
 *  the bodies they enter (a `store`'s closure, a `define`'s methods), which
 *  stand in no flow. */
export function programListing(compiled: unknown): string[] {
  const root = rootOf(compiled);
  const reader = new BinaryProgramReader(root);
  const out = [...flowListings(compiled).values()].flat();
  for (const chunk of root.initialization) {
    chunkListing(root, reader, chunk, out);
  }
  return out;
}

/** Whether a listing pushes the string `text`, as a line's text or a table's
 *  key or value. */
export const pushesString = (listing: readonly string[], text: string) =>
  listing.includes(`Str ${JSON.stringify(text)}`);

/** How many instructions of a listing push the string `text`. */
export const stringCount = (listing: readonly string[], text: string) =>
  listing.filter((line) => line === `Str ${JSON.stringify(text)}`).length;
