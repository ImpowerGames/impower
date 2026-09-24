// A throwaway model of the program layout chosen in docs/engine/binary-program.md
// (#693). It exists to be measured, and nothing that ships imports it.
//
// A program is a root over immutable chunks, one per statement. A chunk is one
// Int32Array: a header, then two-word instructions, then its block table. A
// jump inside a chunk is an offset relative to the next instruction; anything
// outside the chunk is named by a symbol id that the root resolves. A block
// statement (`if`, `choose`) is one chunk whose code says `EnterBlock k`; the
// statements of block k are chunks of their own in a child sequence, which row
// k of the chunk's block table names by id. A sequence id stays with its body:
// a root that rebuilt the body holds the new arrays under the same id, so
// replacing a statement inside a block builds no new owner, and a body below
// the edit finds its owner's new sequence through the root (`insertChunk`,
// `position`).
//
// Lines are held so that an edit moves no stored line beside or below it. A
// sequence's line starts are relative to its body's first line, the root's row
// holds how many lines the body spans, and the owner's block row holds the
// lines of the owner's own parts above the body, so where a body starts is
// worked out from its owner and the bodies above it (`lineOf`). The JSON tree
// carries no source lines, so the program is laid out on synthetic ones: a
// plain statement takes one line, and a block statement one line for each of
// its own parts (`if`, `else`, a choice, `then`, `end`) beside what its bodies
// take.
//
// The writer here does not lower source. It translates the JSON tree the
// current compiler emits for the kinds the comparison scene holds (display
// calls, reassignments, `if` blocks, diverts to a scene, one `choose`) and
// throws, naming the construct, on anything else.
import { NativeFunctionCall } from "../../packages/sparkdown/src/inkjs/engine/NativeFunctionCall";
import { IntValue, StringValue } from "../../packages/sparkdown/src/inkjs/engine/Value";

export const enum Op {
  Text = 1,
  Newline,
  Out,
  Num,
  Str,
  GetVar,
  SetVar,
  BeginString,
  EndString,
  MakeTable,
  Native,
  CallStd,
  Pop,
  Jump,
  JumpIfFalse,
  JumpSym,
  JumpDirect,
  EnterBlock,
  BeginScope,
  EndScope,
  Choice,
  Visit,
  Done,
  End,
}

/** `CallStd`: the call's result is discarded, so none is pushed. */
export const FLAG_DISCARD = 1;
/** `Choice`: the flags the current engine's choice point carries. */
export const CHOICE_HAS_START_CONTENT = 2;
export const CHOICE_HAS_CHOICE_ONLY_CONTENT = 4;

// Header words of a chunk. The code follows the header; the block table, one
// row per block, follows the code. A block row is the id of the block's
// sequence, the position at which the chunk resumes when that sequence runs
// out, and the lines of the chunk's own parts between the body above (or the
// statement's first line) and this body.
export const H_CODE_WORDS = 0;
export const H_BLOCKS = 1;
export const H_ID = 2;
export const HEADER = 3;
export const BLOCK_ROW = 3;
export const B_SEQUENCE = 0;
export const B_RESUME = 1;
export const B_GAP = 2;
/** The synthetic layout: a plain statement's lines, and the lines of a block
 *  statement's own parts below its last body (its `end`). */
export const PLAIN_LINES = 1;
export const TAIL_LINES = 1;
export const FLOW_HEAD_LINES = 1;

export const encode = (op: Op, flags = 0, aux = 0) => op | (flags << 8) | (aux << 16);

// A root's row for one sequence. The arrays are shared between roots and say
// nothing about where the sequence sits; the rest of the row does, and names
// the owner by chunk id and never by entry, which an insertion would shift.
export interface Sequence {
  /** Stays with the body from one root to the next. */
  readonly id: number;
  readonly chunks: Int32Array[];
  /** The chunk id of each entry, which is how a chunk's entry is found. */
  readonly ids: number[];
  /** Each entry's first line, relative to the body's own first line, so that
   *  an edit beside or above the body leaves the array as it is. */
  readonly lineStarts: number[];
  /** How many lines the body spans. */
  readonly lines: number;
  /** A flow's first line in the script, and -1 for a block, whose first line
   *  follows from its owner and the bodies above it. */
  readonly firstLine: number;
  /** The chunk that owns this sequence as one of its blocks, or -1 for a flow.
   *  Which sequence holds the owner is the root's to say (`chunkSeq`). */
  readonly owner: number;
  readonly block: number;
  /** The symbol of the flow this sequence belongs to. */
  readonly flow: number;
}

export interface DirectTarget {
  seq: Sequence;
  symbol: number;
}

export interface ProgramRoot {
  readonly strings: string[];
  readonly stringValues: StringValue[];
  readonly numberValues: IntValue[];
  readonly natives: NativeFunctionCall[];
  readonly symbolNames: string[];
  /** Per sequence id, this root's row for it. */
  readonly sequences: Sequence[];
  /** Per chunk id, the id of the sequence that holds the chunk, -1 when this
   *  root holds no such chunk. The design keeps it in pages so that a compile
   *  copies the pages it writes; here it is one array. */
  readonly chunkSeq: Int32Array;
  /** What a display statement costs in each form, smallest and largest: the
   *  instructions of its chunk, and the runtime objects of the JSON tree it
   *  was translated from. Not part of the layout. */
  readonly displayBeat: { instructions: [number, number]; objects: [number, number] };
  /** Per symbol: the sequence, entry and position that define it, -1 when the
   *  program defines no such symbol. */
  readonly symSeq: Int32Array;
  readonly symIndex: Int32Array;
  readonly symPc: Int32Array;
  /** What a compiler that resolved every divert at compile time would hold in
   *  place of a symbol: the target itself. Only the `direct` candidate of the
   *  symbol measurement reads it. */
  readonly direct: DirectTarget[];
  readonly chunkCount: number;
  readonly instructionCount: number;
  readonly words: number;
  /** Not part of the layout: the flows the writer left out, and the construct
   *  that caused each, for the report. */
  readonly skipped: Map<string, string>;
}

export class UnsupportedConstruct extends Error {
  constructor(readonly construct: string) {
    super(`the prototype writer does not emit: ${construct}`);
  }
}

const isObject = (x: unknown): x is Record<string, any> => x !== null && typeof x === "object" && !Array.isArray(x);
const FLOW_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

class ChunkBuilder {
  readonly code: number[] = [];
  readonly blocks: number[] = [];
  emit(op: Op, flags = 0, aux = 0, arg = 0): number {
    // What can outgrow 16 bits rides in word 1. An operand that still does not
    // fit its field is a construct the writer does not emit, like any other.
    if (aux < 0 || aux > 0xffff || flags < 0 || flags > 0xff) throw new UnsupportedConstruct(`an operand wider than its field in instruction ${op}`);
    this.code.push(encode(op, flags, aux), arg);
    return this.code.length - 2;
  }
  /** Enters `sequence` as the chunk's next block, which resumes after the
   *  instruction emitted here. `gap` is the lines of the statement's own parts
   *  above this body and below the one before it. */
  enterBlock(sequence: number, gap: number) {
    this.emit(Op.EnterBlock, 0, 0, this.blocks.length / BLOCK_ROW);
    this.blocks.push(sequence, HEADER + this.code.length, gap);
  }
  /** Points the jump or the `Choice` at `at` to the next instruction to be
   *  emitted. The distance is word 1, a full 32 bits, so a `choose` of any size
   *  reaches its choices' entry code. */
  land(at: number) {
    this.code[at + 1] = this.code.length - (at + 2);
  }
  get lastOp(): number {
    return this.code.length ? this.code[this.code.length - 2]! & 0xff : 0;
  }
  setLastFlags(flags: number) {
    const at = this.code.length - 2;
    this.code[at] = this.code[at]! | (flags << 8);
  }
  finish(id: number): Int32Array {
    const chunk = new Int32Array(HEADER + this.code.length + this.blocks.length);
    chunk[H_CODE_WORDS] = this.code.length;
    chunk[H_BLOCKS] = this.blocks.length / BLOCK_ROW;
    chunk[H_ID] = id;
    chunk.set(this.code, HEADER);
    chunk.set(this.blocks, HEADER + this.code.length);
    return chunk;
  }
}

/** `resolveDirect` swaps every `JumpSym` for a `JumpDirect`, for the measurement
 *  of what the symbol lookup costs. */
export function writeChunkProgram(compiled: Record<string, any>, options: { resolveDirect?: boolean } = {}): ProgramRoot {
  const strings: string[] = [];
  const stringIds = new Map<string, number>();
  const numbers: number[] = [];
  const numberIds = new Map<number, number>();
  const natives: NativeFunctionCall[] = [];
  const nativeIds = new Map<string, number>();
  const symbolNames: string[] = [];
  const symbolIds = new Map<string, number>();
  const sequences: { -readonly [K in keyof Sequence]: Sequence[K] }[] = [];
  const chunkSeq: number[] = [];
  const displayBeat = { instructions: [Infinity, 0] as [number, number], objects: [Infinity, 0] as [number, number] };
  const definitions: [symbol: number, seq: number, index: number, pc: number][] = [];
  const directJumps: [chunk: Int32Array, at: number, symbol: number][] = [];
  let chunkCount = 0;
  let instructionCount = 0;
  let words = 0;

  const string = (text: string) => {
    let id = stringIds.get(text);
    if (id === undefined) stringIds.set(text, (id = strings.push(text) - 1));
    return id;
  };
  const number = (n: number) => {
    let id = numberIds.get(n);
    if (id === undefined) numberIds.set(n, (id = numbers.push(n) - 1));
    return id;
  };
  const native = (name: string) => {
    let id = nativeIds.get(name);
    if (id === undefined) nativeIds.set(name, (id = natives.push(NativeFunctionCall.CallWithName(name)) - 1));
    return id;
  };
  const symbol = (name: string) => {
    let id = symbolIds.get(name);
    if (id === undefined) symbolIds.set(name, (id = symbolNames.push(name) - 1));
    return id;
  };

  type Building = (typeof sequences)[number];
  const newSequence = (owner: number, block: number, flow: number): Building => {
    const seq: Building = { id: sequences.length, chunks: [], ids: [], lineStarts: [], lines: 0, firstLine: -1, owner, block, flow };
    sequences.push(seq);
    return seq;
  };
  // `lines` is what the statement takes in the synthetic layout: its own parts
  // and its bodies.
  const add = (seq: Building, builder: ChunkBuilder, id: number, lines = PLAIN_LINES) => {
    const chunk = builder.finish(id);
    seq.chunks.push(chunk);
    seq.ids.push(id);
    seq.lineStarts.push(seq.lines);
    seq.lines += lines;
    chunkSeq[id] = seq.id;
    instructionCount += builder.code.length / 2;
    words += chunk.length;
    return chunk;
  };

  const matching = (items: any[], from: number, open: string, close: string) => {
    let depth = 0;
    for (let k = from; k < items.length; k++) {
      if (items[k] === open) depth++;
      else if (items[k] === close && --depth === 0) return k;
    }
    throw new Error(`${open} without ${close}`);
  };

  // The tokens between `str` and `/str`. A literal is one push; anything else
  // is built through the output, as the engine builds it.
  const stringLiteral = (b: ChunkBuilder, items: any[], from: number, to: number) => {
    if (to - from === 1 && typeof items[from] === "string" && items[from].startsWith("^")) {
      b.emit(Op.Str, 0, 0, string(items[from].slice(1)));
      return;
    }
    b.emit(Op.BeginString);
    for (let k = from; k < to; k++) {
      const t = items[k];
      if (typeof t === "string" && t.startsWith("^")) b.emit(Op.Text, 0, 0, string(t.slice(1)));
      else if (t === "ev") {
        const close = matching(items, k, "ev", "/ev");
        expression(b, items, k + 1, close);
        k = close;
      } else throw new UnsupportedConstruct(`string content ${JSON.stringify(t)}`);
    }
    b.emit(Op.EndString);
  };

  // The tokens between `ev` and `/ev`, with the stack depth followed so that a
  // table is built from a count known here and not from a marker found at run
  // time.
  const expression = (b: ChunkBuilder, items: any[], from: number, to: number) => {
    let depth = 0;
    const marks: number[] = [];
    for (let k = from; k < to; k++) {
      const t = items[k];
      if (typeof t === "number") {
        if (!Number.isInteger(t)) throw new UnsupportedConstruct("a number that is not an integer");
        b.emit(Op.Num, 0, 0, number(t));
        depth++;
      } else if (t === "str") {
        const close = matching(items, k, "str", "/str");
        stringLiteral(b, items, k + 1, close);
        depth++;
        k = close;
      } else if (t === "obj{") marks.push(depth);
      else if (t === "}obj") {
        const mark = marks.pop()!;
        // The pair count is word 1: a table literal is as long as its author
        // made it.
        b.emit(Op.MakeTable, 0, 0, (depth - mark) / 2);
        depth = mark + 1;
      } else if (t === "pop") {
        if (b.lastOp === Op.CallStd) b.setLastFlags(FLAG_DISCARD);
        else b.emit(Op.Pop);
        depth--;
      } else if (t === "out") {
        b.emit(Op.Out);
        depth--;
      } else if (typeof t === "string" && t.startsWith("stdlib:")) {
        const [, name, arity] = t.split(":");
        if (name !== "display") throw new UnsupportedConstruct(`builtin ${name}`);
        b.emit(Op.CallStd, 0, Number(arity), string(name));
        depth += 1 - Number(arity);
      } else if (isObject(t) && typeof t["VAR?"] === "string") {
        b.emit(Op.GetVar, 0, 0, string(t["VAR?"]));
        depth++;
      } else if (typeof t === "string" && NativeFunctionCall.CallExistsWithName(t)) {
        const id = native(t);
        const argc = natives[id]!.numberOfParameters;
        b.emit(Op.Native, 0, argc, id);
        depth += 1 - argc;
      } else throw new UnsupportedConstruct(`expression content ${JSON.stringify(t)}`);
    }
  };

  const isBranch = (item: any) => Array.isArray(item) && isObject(item.at(-1)) && Array.isArray(item.at(-1)["$b"]);
  const isWeave = (item: any) => Array.isArray(item) && isObject(item.at(-1)) && Object.keys(item.at(-1)).some((key) => /^[cg]-\d+$/.test(key));

  const conditional = (seq: Building, items: any[], from: number, flow: number): number => {
    const id = chunkCount++;
    const b = new ChunkBuilder();
    const toEnd: number[] = [];
    // The `end` line, then a line for each branch's `if` or `else` and what
    // its body takes.
    let lines = TAIL_LINES;
    let i = from;
    for (; isBranch(items[i]); i++) {
      const branch: any[] = items[i];
      let falseJump = -1;
      if (branch[0] === "ev") {
        const close = matching(branch, 0, "ev", "/ev");
        expression(b, branch, 1, close);
        falseJump = b.emit(Op.JumpIfFalse);
      }
      let body: any[] = branch.at(-1)["$b"].slice(0, -1);
      const rejoin = body.at(-1);
      if (!isObject(rejoin) || typeof rejoin["->"] !== "string") throw new UnsupportedConstruct("a branch that does not rejoin");
      body = body.slice(0, -1);
      if (body[0] === "\n") {
        b.emit(Op.Newline);
        body = body.slice(1);
      }
      const scoped = body[0] === "scope{" && body.at(-1) === "}scope";
      if (scoped) {
        b.emit(Op.BeginScope);
        body = body.slice(1, -1);
      }
      const child = newSequence(id, b.blocks.length / BLOCK_ROW, flow);
      b.enterBlock(child.id, 1);
      if (scoped) b.emit(Op.EndScope);
      toEnd.push(b.emit(Op.Jump));
      if (falseJump >= 0) b.land(falseJump);
      statements(child, body, flow);
      lines += 1 + child.lines;
    }
    if (items[i] !== "nop") throw new UnsupportedConstruct("a conditional with no rejoin point");
    for (const at of toEnd) b.land(at);
    add(seq, b, id, lines);
    return i + 1;
  };

  const texts = (items: any[], what: string): string[] =>
    items.map((t) => {
      if (typeof t !== "string" || !t.startsWith("^")) throw new UnsupportedConstruct(`${what} holding ${JSON.stringify(t)}`);
      return t.slice(1);
    });

  const weave = (seq: Building, item: any[], flow: number) => {
    const id = chunkCount++;
    const b = new ChunkBuilder();
    // The `end` line, then the `choose` line with the first choice's, a line
    // for each later choice and for `then`, and what each body takes.
    let lines = TAIL_LINES;
    const named: Record<string, any[]> = item.at(-1);
    const points: { at: number; count: number; start: string[]; body: any[]; name: string }[] = [];
    for (const choice of item.slice(0, -1) as any[][]) {
      const star = Array.isArray(choice) ? choice.find((t) => isObject(t) && typeof t["*"] === "string") : undefined;
      if (!star) throw new UnsupportedConstruct("content beside the choices of a choose block");
      const flags: number = star.flg ?? 0;
      if (flags & ~(CHOICE_HAS_START_CONTENT | CHOICE_HAS_CHOICE_ONLY_CONTENT)) throw new UnsupportedConstruct(`a choice with flags ${flags}`);
      const start = flags & CHOICE_HAS_START_CONTENT ? texts(choice.at(-1)["$s"].slice(0, -2), "choice start content") : [];
      let at = choice.indexOf("str");
      if (flags & CHOICE_HAS_START_CONTENT) {
        b.emit(Op.BeginString);
        for (const text of start) b.emit(Op.Text, 0, 0, string(text));
        b.emit(Op.EndString);
        at = choice.indexOf("str", matching(choice, at, "str", "/str"));
      }
      if (flags & CHOICE_HAS_CHOICE_ONLY_CONTENT) {
        b.emit(Op.BeginString);
        for (const text of texts(choice.slice(at + 1, matching(choice, at, "str", "/str")), "choice text")) b.emit(Op.Text, 0, 0, string(text));
        b.emit(Op.EndString);
      }
      const name: string = star["*"].split(".").at(-1);
      // The `Choice` holds its target. Its count symbol is the operand of the
      // `Visit` that opens the entry code it points at.
      const count = symbol(`${symbolNames[flow]}#${id}.${name}`);
      points.push({ at: b.emit(Op.Choice, flags), count, start, body: named[name]!, name });
    }
    b.emit(Op.Done);
    const gathers = Object.keys(named).filter((key) => /^g-\d+$/.test(key));
    if (gathers.length > 1) throw new UnsupportedConstruct("a choose block with more than one gather");
    const toThen: number[] = [];
    for (const point of points) {
      b.land(point.at);
      // Once chosen, a choice counts, repeats its start content as output, ends
      // that line, and runs its body.
      b.emit(Op.Visit, 0, 0, point.count);
      for (const text of point.start) b.emit(Op.Text, 0, 0, string(text));
      let body = point.body.slice(0, -1);
      const newline = body.indexOf("\n");
      if (newline < 0 || newline > 6) throw new UnsupportedConstruct("a choice body of an unknown shape");
      body = body.slice(newline + 1);
      b.emit(Op.Newline);
      const last = body.at(-1);
      if (isObject(last) && typeof last["->"] === "string" && /\.g-\d+$/.test(last["->"])) body = body.slice(0, -1);
      const child = newSequence(id, b.blocks.length / BLOCK_ROW, flow);
      const gap = b.blocks.length === 0 ? 2 : 1;
      b.enterBlock(child.id, gap);
      toThen.push(b.emit(Op.Jump));
      statements(child, body, flow);
      lines += gap + child.lines;
    }
    for (const at of toThen) b.land(at);
    if (gathers.length) {
      b.emit(Op.Visit, 0, 0, symbol(`${symbolNames[flow]}#${id}.${gathers[0]}`));
      const child = newSequence(id, b.blocks.length / BLOCK_ROW, flow);
      b.enterBlock(child.id, 1);
      statements(child, named[gathers[0]!]!.slice(0, -1), flow);
      lines += 1 + child.lines;
    }
    add(seq, b, id, lines);
  };

  // One chunk per statement of a body.
  const statements = (seq: Building, items: any[], flow: number) => {
    let i = 0;
    while (i < items.length) {
      const item = items[i];
      if (item === "ev") {
        const close = matching(items, i, "ev", "/ev");
        const b = new ChunkBuilder();
        const displays = items.slice(i + 1, close).some((t) => typeof t === "string" && t.startsWith("stdlib:display:"));
        expression(b, items, i + 1, close);
        const next = items[close + 1];
        if (isObject(next) && typeof next["VAR="] === "string") {
          if (!next.re) throw new UnsupportedConstruct("a variable declaration inside a flow");
          b.emit(Op.SetVar, 0, 0, string(next["VAR="]));
          i = close + 2;
        } else {
          if (displays && !items.slice(i + 1, close).includes("ev")) {
            // A beat whose text interpolates nothing. The engine steps every
            // token from `ev` to `/ev`.
            const objects = close - i + 1;
            const instructions = b.code.length / 2;
            displayBeat.objects = [Math.min(displayBeat.objects[0], objects), Math.max(displayBeat.objects[1], objects)];
            displayBeat.instructions = [Math.min(displayBeat.instructions[0], instructions), Math.max(displayBeat.instructions[1], instructions)];
          }
          i = close + 1;
        }
        add(seq, b, chunkCount++);
      } else if (isBranch(item)) i = conditional(seq, items, i, flow);
      else if (isWeave(item)) {
        weave(seq, item, flow);
        i++;
      } else if (isObject(item) && typeof item["->"] === "string" && !item.c && !item.var && FLOW_NAME.test(item["->"])) {
        const b = new ChunkBuilder();
        const at = b.emit(Op.JumpSym, 0, 0, symbol(item["->"]));
        const chunk = add(seq, b, chunkCount++);
        directJumps.push([chunk, HEADER + at, symbol(item["->"])]);
        i++;
      } else if (item === "done" || item === "end") {
        const b = new ChunkBuilder();
        b.emit(item === "done" ? Op.Done : Op.End);
        add(seq, b, chunkCount++);
        i++;
      } else if (item === "\n") {
        const b = new ChunkBuilder();
        b.emit(Op.Newline);
        add(seq, b, chunkCount++);
        i++;
      } else if (item === "nop") i++;
      else throw new UnsupportedConstruct(`statement ${JSON.stringify(item)?.slice(0, 80)}`);
    }
  };

  // Every top-level flow the writer can emit. One it cannot is left undefined,
  // and a divert to it fails when it runs.
  const skipped = new Map<string, string>();
  const root: any[] = compiled["root"];
  const flows = Object.entries(root.at(-1) as Record<string, any>).filter(([name, flow]) => Array.isArray(flow) && FLOW_NAME.test(name));
  // Every flow is interned before any is emitted, so a flow's id follows the
  // order the flows are declared in and not the order diverts first name them.
  for (const [name] of flows) symbol(name);
  // Where the next flow's header line falls in the synthetic script.
  let scriptLine = 0;
  for (const [name, flow] of flows) {
    const sym = symbol(name);
    const mark = { sequences: sequences.length, chunks: chunkCount, instructions: instructionCount, words, direct: directJumps.length, beat: structuredClone(displayBeat) };
    try {
      if (isObject(flow.at(-1)) && Object.keys(flow.at(-1)).some((key) => !key.startsWith("#"))) throw new UnsupportedConstruct("a flow with named content");
      const seq = newSequence(-1, -1, sym);
      statements(seq, flow.slice(0, -1), sym);
      if (seq.chunks.length) definitions.push([sym, seq.id, 0, HEADER]);
      // A header line, the body, and an `end` line.
      seq.firstLine = scriptLine + FLOW_HEAD_LINES;
      scriptLine = seq.firstLine + seq.lines + TAIL_LINES;
    } catch (error) {
      if (!(error instanceof UnsupportedConstruct)) throw error;
      skipped.set(name, error.construct);
      sequences.length = mark.sequences;
      chunkSeq.length = chunkCount = mark.chunks;
      instructionCount = mark.instructions;
      words = mark.words;
      directJumps.length = mark.direct;
      Object.assign(displayBeat, mark.beat);
    }
  }

  const symSeq = new Int32Array(symbolNames.length).fill(-1);
  const symIndex = new Int32Array(symbolNames.length);
  const symPc = new Int32Array(symbolNames.length);
  for (const [sym, seq, index, pc] of definitions) {
    symSeq[sym] = seq;
    symIndex[sym] = index;
    symPc[sym] = pc;
  }
  const direct: DirectTarget[] = [];
  if (options.resolveDirect) {
    for (const [chunk, at, sym] of directJumps) {
      if (symSeq[sym]! < 0) continue;
      chunk[at] = encode(Op.JumpDirect);
      chunk[at + 1] = direct.push({ seq: sequences[symSeq[sym]!]!, symbol: sym }) - 1;
    }
  }
  return {
    strings,
    stringValues: strings.map((text) => new StringValue(text)),
    numberValues: numbers.map((n) => new IntValue(n)),
    natives,
    symbolNames,
    sequences,
    chunkSeq: Int32Array.from(chunkSeq),
    displayBeat,
    symSeq,
    symIndex,
    symPc,
    direct,
    chunkCount,
    instructionCount,
    words,
    skipped,
  };
}

/** Where `root` holds a chunk: the row of its sequence, and its entry there.
 *  The entry is searched for and never stored, because an insertion shifts it;
 *  the design searches outward from the entry a position was last seen at, or
 *  through an index the arrays build on first use. */
export function position(root: ProgramRoot, chunkId: number): { sequence: Sequence; entry: number } | undefined {
  const id = root.chunkSeq[chunkId];
  if (id === undefined || id < 0) return undefined;
  const sequence = root.sequences[id]!;
  const entry = sequence.ids.indexOf(chunkId);
  return entry < 0 ? undefined : { sequence, entry };
}

/** A copy of a chunk that owns no block, under the next chunk id of `root`. */
export function copyChunk(root: ProgramRoot, chunk: Int32Array): Int32Array {
  if (chunk[H_BLOCKS]! > 0) throw new Error("a copy of a block statement would share its blocks' sequences with the original");
  const copy = chunk.slice();
  copy[H_ID] = root.chunkCount;
  return copy;
}

/** The first line of a body: a flow's own, or what follows from the owner's
 *  first line, the owner's parts above the body and the bodies above it. */
function bodyFirstLine(root: ProgramRoot, body: Sequence): number {
  if (body.owner < 0) return body.firstLine;
  const owner = position(root, body.owner);
  if (!owner) throw new Error(`the root holds no chunk ${body.owner}, which owns sequence ${body.id}`);
  const chunk = owner.sequence.chunks[owner.entry]!;
  const table = HEADER + chunk[H_CODE_WORDS]!;
  let line = bodyFirstLine(root, owner.sequence) + owner.sequence.lineStarts[owner.entry]!;
  for (let k = 0; k <= body.block; k++) {
    line += chunk[table + k * BLOCK_ROW + B_GAP]!;
    if (k < body.block) line += root.sequences[chunk[table + k * BLOCK_ROW + B_SEQUENCE]!]!.lines;
  }
  return line;
}

/** The line a statement starts on, through the root that is asked. */
export function lineOf(root: ProgramRoot, chunkId: number): number {
  const at = position(root, chunkId);
  if (!at) throw new Error(`the root holds no chunk ${chunkId}`);
  return bodyFirstLine(root, at.sequence) + at.sequence.lineStarts[at.entry]!;
}

/** Every chunk id of the program in the order the script holds the statements:
 *  the flows as they were declared, and under a block statement its bodies in
 *  turn. */
export function documentOrder(root: ProgramRoot): number[] {
  const order: number[] = [];
  const walk = (body: Sequence) => {
    body.chunks.forEach((chunk, entry) => {
      order.push(body.ids[entry]!);
      const table = HEADER + chunk[H_CODE_WORDS]!;
      for (let k = 0; k < chunk[H_BLOCKS]!; k++) walk(root.sequences[chunk[table + k * BLOCK_ROW + B_SEQUENCE]!]!);
    });
  };
  for (const row of root.sequences) if (row.owner < 0) walk(row);
  return order;
}

/** The lines of every sequence laid out again from nothing but the chunks: what
 *  a root's line starts, spans and first lines have to equal however many edits
 *  built it. `plain` gives the lines of a statement that owns no block. */
export function layoutFromScratch(root: ProgramRoot, plain: (chunkId: number) => number = () => PLAIN_LINES): Map<number, { lineStarts: number[]; lines: number; firstLine: number }> {
  const layout = new Map<number, { lineStarts: number[]; lines: number; firstLine: number }>();
  const measure = (body: Sequence): number => {
    const lineStarts: number[] = [];
    let lines = 0;
    body.chunks.forEach((chunk, entry) => {
      lineStarts.push(lines);
      const blocks = chunk[H_BLOCKS]!;
      const table = HEADER + chunk[H_CODE_WORDS]!;
      if (blocks === 0) lines += plain(body.ids[entry]!);
      else {
        lines += TAIL_LINES;
        for (let k = 0; k < blocks; k++) lines += chunk[table + k * BLOCK_ROW + B_GAP]! + measure(root.sequences[chunk[table + k * BLOCK_ROW + B_SEQUENCE]!]!);
      }
    });
    layout.set(body.id, { lineStarts, lines, firstLine: -1 });
    return lines;
  };
  let scriptLine = 0;
  for (const row of root.sequences) {
    if (row.owner >= 0) continue;
    const lines = measure(row);
    const firstLine = scriptLine + FLOW_HEAD_LINES;
    layout.get(row.id)!.firstLine = firstLine;
    scriptLine = firstLine + lines + TAIL_LINES;
  }
  return layout;
}

/** The root a compile that inserted `chunk` at `entry` of one sequence would
 *  build. The sequence keeps its id and gets new arrays, the chunk table gains
 *  the chunk's row, and a symbol defined later in the same sequence moves one
 *  entry on. The lines follow the insertion up the owners: each sequence that
 *  encloses the edit gets new line starts for the entries below the owner and a
 *  longer span, and each later flow a later first line. Every other row, every
 *  array that did not change, every chunk and `root` itself stay as they were.
 *  So a body below or beside the edit is reached through the new root with its
 *  own row untouched, and its lines come out right because they are worked out
 *  from its owner. */
export function insertChunk(root: ProgramRoot, sequence: number, entry: number, chunk: Int32Array, lines = PLAIN_LINES): ProgramRoot {
  if (root.direct.length > 0) throw new Error("diverts resolved at compile time hold their targets, which is what symbols are for");
  const row = root.sequences[sequence]!;
  const id = chunk[H_ID]!;
  const chunks = row.chunks.slice();
  chunks.splice(entry, 0, chunk);
  const ids = row.ids.slice();
  ids.splice(entry, 0, id);
  const lineStarts = row.lineStarts.slice();
  lineStarts.splice(entry, 0, entry < row.lineStarts.length ? row.lineStarts[entry]! : row.lines);
  for (let i = entry + 1; i < lineStarts.length; i++) lineStarts[i]! += lines;
  const sequences = root.sequences.slice();
  sequences[sequence] = { ...row, chunks, ids, lineStarts, lines: row.lines + lines };
  let flow = row;
  for (let body = row; body.owner >= 0; ) {
    const owner = position(root, body.owner);
    if (!owner) throw new Error(`the root holds no chunk ${body.owner}, which owns sequence ${body.id}`);
    const enclosing = owner.sequence;
    // Nothing below the owner, nothing to shift: the array is shared too.
    let starts = enclosing.lineStarts;
    if (owner.entry + 1 < starts.length) {
      starts = starts.slice();
      for (let i = owner.entry + 1; i < starts.length; i++) starts[i]! += lines;
    }
    sequences[enclosing.id] = { ...enclosing, lineStarts: starts, lines: enclosing.lines + lines };
    flow = body = enclosing;
  }
  for (const other of root.sequences) if (other.owner < 0 && other.firstLine > flow.firstLine) sequences[other.id] = { ...other, firstLine: other.firstLine + lines };
  const chunkSeq = new Int32Array(Math.max(root.chunkSeq.length, id + 1)).fill(-1);
  chunkSeq.set(root.chunkSeq);
  chunkSeq[id] = sequence;
  // A flow's own symbol names the start of its sequence, whichever chunk is
  // there; a symbol a chunk exports moves with that chunk.
  const symIndex = root.symIndex.slice();
  for (let s = 0; s < symIndex.length; s++) if (root.symSeq[s] === sequence && symIndex[s]! >= entry && !(row.owner < 0 && row.flow === s)) symIndex[s]!++;
  return {
    ...root,
    sequences,
    chunkSeq,
    symIndex,
    chunkCount: Math.max(root.chunkCount, id + 1),
    instructionCount: root.instructionCount + chunk[H_CODE_WORDS]! / 2,
    words: root.words + chunk.length,
  };
}
