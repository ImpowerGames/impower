// What inserting and replacing a statement's chunk costs in the structure that
// holds the chunks of a sequence in order (#693).
//
// Run through engine-bench.mjs, one candidate per process, with the
// configuration as one JSON argument: { project, line, candidate, samples,
// warmup, json }. The sizes come from the named project: the largest sequence
// of the flow that holds the line, in statements, which is the sequence an edit
// near the bottom of a real scene lands in; every statement of that flow in one
// sequence, which is what the flow would be with no nesting; and the flow's
// record count in #314's encoding, which is the scale the ticket names.
//
//   flat-copy       a sequence is an array of chunks beside an array of line
//                   starts; an edit builds new arrays and leaves the old
//                   sequence as it was, which is what lets a preview compile
//                   share everything it did not touch and be dropped
//   flat-splice     the same arrays edited in place, which a preview would have
//                   to undo
//   tree-copy       a persistent tree of 32-wide nodes that carry their chunk
//                   and line counts; an edit copies the path to one leaf
//   records-splice  #314's cost of carrying one unchanged flow of this size
//                   into a compile's buffer: a bulk copy of its records. It is
//                   the floor of what #314 pays per flow per compile; the flow
//                   an edit touched is written again record by record, which
//                   `--mode emit` prices
//
// An insert also moves the line start of every later statement, and a replace
// does when the statement's line count changed, so both are timed with that
// restamp. Each is timed at the top, the middle and the bottom of the sequence.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { silenceConsole, stats } from "./benchProject";
import { measureProjectShape } from "./projectShape";

interface OrderBenchConfig {
  project: string;
  line: number;
  candidate: "flat-copy" | "flat-splice" | "tree-copy" | "records-splice";
  samples: number;
  warmup: number;
  json?: string;
}

const config: OrderBenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/engine-bench.mjs");

const OPS_PER_SAMPLE = 2000;
const LINES_PER_STATEMENT = 3;
type Chunk = Int32Array;
const newChunk = () => new Int32Array(16);

interface Structure {
  insert(at: number, chunk: Chunk, lines: number): void;
  replace(at: number, chunk: Chunk, lines: number): void;
  /** The chunk at `at` and the line it starts on, so that every candidate can
   *  be shown to hold the same sequence. */
  read(at: number): [Chunk, number];
  readonly length: number;
}

// An edit builds a new sequence over the same chunks. The result is dropped, as
// a preview's is, so every operation starts from the same sequence.
//
// The line starts are a plain array of small integers and not a typed array:
// allocating a typed array costs more than copying a few hundred numbers does.
function flatCopy(chunks: Chunk[], spans: number[]): Structure {
  const lineStarts: number[] = [0];
  for (let i = 1; i < chunks.length; i++) lineStarts.push(lineStarts[i - 1]! + spans[i - 1]!);
  let last = { chunks, lineStarts };
  return {
    insert(at, chunk, lines) {
      const next = chunks.slice();
      next.splice(at, 0, chunk);
      const starts = lineStarts.slice();
      starts.splice(at, 0, lineStarts[at]!);
      for (let i = at + 1; i < starts.length; i++) starts[i]! += lines;
      last = { chunks: next, lineStarts: starts };
    },
    replace(at, chunk, lines) {
      const next = chunks.slice();
      next[at] = chunk;
      const delta = lines - spans[at]!;
      const starts = lineStarts.slice();
      if (delta !== 0) for (let i = at + 1; i < starts.length; i++) starts[i]! += delta;
      last = { chunks: next, lineStarts: starts };
    },
    read: (at) => [last.chunks[at]!, last.lineStarts[at]!],
    get length() {
      return last.chunks.length;
    },
  };
}

// The same arrays edited in place. An insert is taken back out again so the
// sequence keeps its size, and the removal is not timed apart from it: a real
// compile that inserted would not remove, so this candidate's insert figure is
// an insert and a delete. A replace restamps once, as a real one would, and
// every second replace at an entry gives the statement its first line count
// back, so the line starts return to where they were every two operations.
function flatSplice(chunks: Chunk[], spans: number[]): Structure {
  const list = chunks.slice();
  const lineStarts = new Int32Array(chunks.length + 1);
  for (let i = 1; i < chunks.length; i++) lineStarts[i] = lineStarts[i - 1]! + spans[i - 1]!;
  let length = chunks.length;
  const grown = new Uint8Array(chunks.length);
  return {
    insert(at, chunk, lines) {
      list.splice(at, 0, chunk);
      lineStarts.copyWithin(at + 1, at, length);
      for (let i = at + 1; i <= length; i++) lineStarts[i]! += lines;
      length++;
      list.splice(at, 1);
      lineStarts.copyWithin(at, at + 1, length);
      for (let i = at; i < length - 1; i++) lineStarts[i]! -= lines;
      length--;
    },
    replace(at, chunk, lines) {
      const delta = grown[at] ? spans[at]! - lines : lines - spans[at]!;
      grown[at]! ^= 1;
      list[at] = chunk;
      if (delta !== 0) for (let i = at + 1; i < length; i++) lineStarts[i]! += delta;
    },
    read: (at) => [list[at]!, lineStarts[at]!],
    get length() {
      return length;
    },
  };
}

// A persistent tree: leaves hold up to WIDTH chunks with their line counts, and
// a branch holds up to WIDTH children with the chunks and lines under each.
const WIDTH = 32;
interface Leaf {
  chunks: Chunk[];
  spans: number[];
  size: number;
  lines: number;
}
interface Branch {
  children: TreeNode[];
  size: number;
  lines: number;
}
type TreeNode = Leaf | Branch;
const isLeaf = (node: TreeNode): node is Leaf => (node as Leaf).chunks !== undefined;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const leaf = (chunks: Chunk[], spans: number[]): Leaf => ({ chunks, spans, size: chunks.length, lines: sum(spans) });
const branch = (children: TreeNode[]): Branch => ({ children, size: sum(children.map((c) => c.size)), lines: sum(children.map((c) => c.lines)) });

function buildTree(chunks: Chunk[], spans: number[]): TreeNode {
  let level: TreeNode[] = [];
  for (let i = 0; i < chunks.length; i += WIDTH) level.push(leaf(chunks.slice(i, i + WIDTH), spans.slice(i, i + WIDTH)));
  while (level.length > 1) {
    const up: TreeNode[] = [];
    for (let i = 0; i < level.length; i += WIDTH) up.push(branch(level.slice(i, i + WIDTH)));
    level = up;
  }
  return level[0] ?? leaf([], []);
}

// The node with the edit applied, as one node or as two when it overflowed.
function edited(node: TreeNode, at: number, chunk: Chunk, lines: number, insert: boolean): TreeNode[] {
  if (isLeaf(node)) {
    const chunks = node.chunks.slice();
    const spans = node.spans.slice();
    if (insert) {
      chunks.splice(at, 0, chunk);
      spans.splice(at, 0, lines);
    } else {
      chunks[at] = chunk;
      spans[at] = lines;
    }
    if (chunks.length <= WIDTH) return [leaf(chunks, spans)];
    const half = chunks.length >> 1;
    return [leaf(chunks.slice(0, half), spans.slice(0, half)), leaf(chunks.slice(half), spans.slice(half))];
  }
  let i = 0;
  while (i < node.children.length - 1 && at >= node.children[i]!.size + (insert ? 1 : 0)) at -= node.children[i++]!.size;
  const children = node.children.slice();
  children.splice(i, 1, ...edited(node.children[i]!, at, chunk, lines, insert));
  if (children.length <= WIDTH) return [branch(children)];
  const half = children.length >> 1;
  return [branch(children.slice(0, half)), branch(children.slice(half))];
}

function treeCopy(chunks: Chunk[], spans: number[]): Structure {
  const base = buildTree(chunks, spans);
  let last = base;
  const apply = (at: number, chunk: Chunk, lines: number, insert: boolean) => {
    const made = edited(base, at, chunk, lines, insert);
    last = made.length === 1 ? made[0]! : branch(made);
  };
  return {
    insert: (at, chunk, lines) => apply(at, chunk, lines, true),
    replace: (at, chunk, lines) => apply(at, chunk, lines, false),
    read(at) {
      let node = last;
      let line = 0;
      while (!isLeaf(node)) {
        let i = 0;
        while (at >= node.children[i]!.size) {
          at -= node.children[i]!.size;
          line += node.children[i++]!.lines;
        }
        node = node.children[i]!;
      }
      for (let i = 0; i < at; i++) line += node.spans[i]!;
      return [node.chunks[at]!, line];
    },
    get length() {
      return last.size;
    },
  };
}

function timeStructure(make: (chunks: Chunk[], spans: number[]) => Structure, statements: number) {
  const chunks = Array.from({ length: statements }, newChunk);
  const spans = new Array<number>(statements).fill(LINES_PER_STATEMENT);
  const structure = make(chunks, spans);
  const positions: [string, number][] = [
    ["top", 0],
    ["middle", statements >> 1],
    ["bottom", statements - 1],
  ];
  // Shown before anything is timed: an insert and a replace leave the chunk
  // where it was put, on the line it should start on, with the rest shifted.
  const probe = newChunk();
  const at = statements >> 1;
  structure.insert(at, probe, 5);
  if (config.candidate !== "flat-splice") {
    if (structure.length !== statements + 1 || structure.read(at)[0] !== probe || structure.read(at)[1] !== at * LINES_PER_STATEMENT || structure.read(at + 1)[1] !== at * LINES_PER_STATEMENT + 5) throw new Error("the insert did not produce the expected sequence");
  }
  structure.replace(at, probe, 5);
  // A statement that grew by two lines leaves the one after it two lines
  // further down.
  const after = Math.min(at + 1, statements - 1);
  const moved = after > at ? 2 : 0;
  if (structure.read(at)[0] !== probe || structure.read(after)[1] !== after * LINES_PER_STATEMENT + moved) throw new Error("the replace did not produce the expected sequence");

  const rows: Record<string, { min: number; median: number; max: number }> = {};
  for (const [where, index] of positions) {
    for (const op of ["insert", "replace"] as const) {
      const perOp: number[] = [];
      for (let i = 0; i < config.warmup + config.samples; i++) {
        const fresh = Array.from({ length: OPS_PER_SAMPLE }, newChunk);
        const t0 = performance.now();
        if (op === "insert") for (let k = 0; k < OPS_PER_SAMPLE; k++) structure.insert(index, fresh[k]!, 5);
        else for (let k = 0; k < OPS_PER_SAMPLE; k++) structure.replace(index, fresh[k]!, 5);
        const t1 = performance.now();
        if (i >= config.warmup) perOp.push(((t1 - t0) * 1e6) / OPS_PER_SAMPLE);
      }
      rows[`${op} at the ${where}`] = stats(perOp);
    }
  }
  return rows;
}

// One unchanged flow carried into a compile's buffer, as ProgramBinaryWriter's
// splice does it: a bulk copy of three slots per record.
function timeRecords(records: number) {
  const flow = new Uint32Array(records * 3).fill(7);
  const buffer = new Uint32Array(records * 3 * 2);
  const perOp: number[] = [];
  for (let i = 0; i < config.warmup + config.samples; i++) {
    const t0 = performance.now();
    for (let k = 0; k < OPS_PER_SAMPLE; k++) buffer.set(flow, (k & 1) * flow.length);
    const t1 = performance.now();
    if (i >= config.warmup) perOp.push(((t1 - t0) * 1e6) / OPS_PER_SAMPLE);
  }
  return { "copy of the flow's records": stats(perOp) };
}

function main() {
  const realLog = silenceConsole();
  const { shape } = measureProjectShape(config.project, config.line);
  const sizes: [string, number][] = [
    [`the largest sequence of ${shape.flow}`, shape.sequences[0]!],
    [`every statement of ${shape.flow} in one sequence`, shape.flowStatements],
    [`one entry per record of ${shape.flow}`, shape.flowRecords],
  ];
  const make = config.candidate === "flat-copy" ? flatCopy : config.candidate === "flat-splice" ? flatSplice : config.candidate === "tree-copy" ? treeCopy : undefined;
  const results = make ? sizes.map(([what, n]) => ({ what, entries: n, nanoseconds: timeStructure(make, n) })) : [{ what: `the records of ${shape.flow}`, entries: shape.flowRecords, nanoseconds: timeRecords(shape.flowRecords) }];
  const report = { candidate: config.candidate, project: config.project, warmup: config.warmup, samples: config.samples, operationsPerSample: OPS_PER_SAMPLE, shape, results };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  const f = (n: number) => n.toFixed(0).padStart(9);
  const out = [`candidate ${report.candidate}: flow ${shape.flow}, ${shape.flowRecords} records, ${shape.flowStatements} statements in ${shape.sequences.length} sequences, the largest of ${shape.sequences[0]}; ${OPS_PER_SAMPLE} operations per sample, ${report.samples} samples after ${report.warmup} warm-up`];
  for (const result of results) {
    out.push(`  ${result.what}, ${result.entries} entries (nanoseconds per operation)`, `  ${"".padEnd(28)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`);
    for (const [row, s] of Object.entries(result.nanoseconds)) out.push(`  ${row.padEnd(28)} ${f(s.min)} ${f(s.median)} ${f(s.max)}`);
  }
  realLog(out.join("\n"));
}

try {
  main();
  process.exit(0);
} catch (error) {
  process.stdout.write(`chunk order bench failed: ${(error as Error)?.stack ?? error}\n`);
  process.exit(1);
}
