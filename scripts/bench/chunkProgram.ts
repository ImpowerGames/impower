// A throwaway model of the program layout chosen in docs/engine/binary-program.md
// (#693). It exists to be measured, and nothing that ships imports it.
//
// A program is a root over immutable chunks, one per statement. A chunk is one
// Int32Array: a header, then two-word instructions, then its block table. A
// jump inside a chunk is an offset relative to the next instruction; anything
// outside the chunk is named by a symbol id that the root resolves. A block
// statement (`if`, `choose`) is one chunk whose code says `EnterBlock k`; the
// statements of block k are chunks of their own in a child sequence that the
// root holds under the owner's chunk id, so replacing a statement inside a
// block builds no new owner.
//
// The writer here does not lower source. It translates the JSON tree the
// current compiler emits for the kinds the comparison scene holds (display
// calls, reassignments, `if` blocks, diverts to a scene, one `choose`) and
// throws, naming the construct, on anything else.
import { NativeFunctionCall } from "../../packages/sparkdown/src/inkjs/engine/NativeFunctionCall";
import { IntValue, StringValue } from "../../packages/sparkdown/src/inkjs/engine/Value";

export const enum Op {
  LineStart = 1,
  Text,
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
// resume position per block, follows the code.
export const H_CODE_WORDS = 0;
export const H_BLOCKS = 1;
export const H_ID = 2;
export const HEADER = 3;

export const encode = (op: Op, flags = 0, aux = 0) => op | (flags << 8) | (aux << 16);

export interface Sequence {
  readonly id: number;
  readonly chunks: Int32Array[];
  /** The chunk id of each entry, so a chunk can be found again by identity. */
  readonly ids: number[];
  /** The chunk that owns this sequence as one of its blocks, or -1 for a flow. */
  readonly owner: number;
  readonly ownerSeq: number;
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
  readonly sequences: Sequence[];
  /** Per chunk id, the sequence id of each of its blocks. */
  readonly blocks: number[][];
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
    this.code.push(encode(op, flags, aux), arg);
    return this.code.length - 2;
  }
  /** Points the jump at `at` to the next instruction to be emitted. */
  land(at: number) {
    this.code[at + 1] = this.code.length - (at + 2);
  }
  /** The same for a `Choice`, whose target rides in the high half of word 0. */
  landChoice(at: number) {
    const delta = this.code.length - (at + 2);
    if (delta > 0xffff) throw new Error("a choice's target is out of reach");
    this.code[at] = (this.code[at]! & 0xffff) | (delta << 16);
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
    chunk[H_BLOCKS] = this.blocks.length;
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
  const sequences: Sequence[] = [];
  const blocks: number[][] = [];
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

  const newSequence = (owner: number, ownerSeq: number, block: number, flow: number): Sequence => {
    const seq: Sequence = { id: sequences.length, chunks: [], ids: [], owner, ownerSeq, block, flow };
    sequences.push(seq);
    return seq;
  };
  const add = (seq: Sequence, builder: ChunkBuilder, id: number) => {
    const chunk = builder.finish(id);
    seq.chunks.push(chunk);
    seq.ids.push(id);
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
        b.emit(Op.MakeTable, 0, (depth - mark) / 2);
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

  const conditional = (seq: Sequence, items: any[], from: number, flow: number): number => {
    const id = chunkCount++;
    const b = new ChunkBuilder();
    const owned: number[] = [];
    const toEnd: number[] = [];
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
      const child = newSequence(id, seq.id, owned.length, flow);
      owned.push(child.id);
      b.emit(Op.EnterBlock, 0, 0, b.blocks.length);
      b.blocks.push(HEADER + b.code.length);
      if (scoped) b.emit(Op.EndScope);
      toEnd.push(b.emit(Op.Jump));
      if (falseJump >= 0) b.land(falseJump);
      statements(child, body, flow);
    }
    if (items[i] !== "nop") throw new UnsupportedConstruct("a conditional with no rejoin point");
    for (const at of toEnd) b.land(at);
    blocks[id] = owned;
    add(seq, b, id);
    return i + 1;
  };

  const texts = (items: any[], what: string): string[] =>
    items.map((t) => {
      if (typeof t !== "string" || !t.startsWith("^")) throw new UnsupportedConstruct(`${what} holding ${JSON.stringify(t)}`);
      return t.slice(1);
    });

  const weave = (seq: Sequence, item: any[], flow: number) => {
    const id = chunkCount++;
    const b = new ChunkBuilder();
    const named: Record<string, any[]> = item.at(-1);
    const owned: number[] = [];
    const points: { at: number; start: string[]; body: any[]; name: string }[] = [];
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
      const count = symbol(`${symbolNames[flow]}#${id}.${name}`);
      points.push({ at: b.emit(Op.Choice, flags, 0, count), start, body: named[name]!, name });
    }
    b.emit(Op.Done);
    const gathers = Object.keys(named).filter((key) => /^g-\d+$/.test(key));
    if (gathers.length > 1) throw new UnsupportedConstruct("a choose block with more than one gather");
    const toThen: number[] = [];
    for (const point of points) {
      b.landChoice(point.at);
      // Once chosen, a choice repeats its start content as output, ends that
      // line, and runs its body.
      for (const text of point.start) b.emit(Op.Text, 0, 0, string(text));
      let body = point.body.slice(0, -1);
      const newline = body.indexOf("\n");
      if (newline < 0 || newline > 6) throw new UnsupportedConstruct("a choice body of an unknown shape");
      body = body.slice(newline + 1);
      b.emit(Op.Newline);
      b.emit(Op.Visit, 0, 0, b.code[point.at + 1]!);
      const last = body.at(-1);
      if (isObject(last) && typeof last["->"] === "string" && /\.g-\d+$/.test(last["->"])) body = body.slice(0, -1);
      const child = newSequence(id, seq.id, owned.length, flow);
      owned.push(child.id);
      b.emit(Op.EnterBlock, 0, 0, b.blocks.length);
      b.blocks.push(HEADER + b.code.length);
      toThen.push(b.emit(Op.Jump));
      statements(child, body, flow);
    }
    for (const at of toThen) b.land(at);
    if (gathers.length) {
      b.emit(Op.Visit, 0, 0, symbol(`${symbolNames[flow]}#${id}.${gathers[0]}`));
      const child = newSequence(id, seq.id, owned.length, flow);
      owned.push(child.id);
      b.emit(Op.EnterBlock, 0, 0, b.blocks.length);
      b.blocks.push(HEADER + b.code.length);
      statements(child, named[gathers[0]!]!.slice(0, -1), flow);
    }
    blocks[id] = owned;
    add(seq, b, id);
  };

  // One chunk per statement of a body.
  const statements = (seq: Sequence, items: any[], flow: number) => {
    let i = 0;
    while (i < items.length) {
      const item = items[i];
      if (item === "ev") {
        const close = matching(items, i, "ev", "/ev");
        const b = new ChunkBuilder();
        // A statement that displays starts a new line, and says so before its
        // argument is evaluated.
        if (items.slice(i + 1, close).some((t) => typeof t === "string" && t.startsWith("stdlib:display:"))) b.emit(Op.LineStart);
        expression(b, items, i + 1, close);
        const next = items[close + 1];
        if (isObject(next) && typeof next["VAR="] === "string") {
          if (!next.re) throw new UnsupportedConstruct("a variable declaration inside a flow");
          b.emit(Op.SetVar, 0, 0, string(next["VAR="]));
          i = close + 2;
        } else i = close + 1;
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
  for (const [name, flow] of Object.entries(root.at(-1) as Record<string, any>)) {
    if (!Array.isArray(flow) || !FLOW_NAME.test(name)) continue;
    const sym = symbol(name);
    const mark = { sequences: sequences.length, chunks: chunkCount, instructions: instructionCount, words, direct: directJumps.length };
    try {
      if (isObject(flow.at(-1)) && Object.keys(flow.at(-1)).some((key) => !key.startsWith("#"))) throw new UnsupportedConstruct("a flow with named content");
      const seq = newSequence(-1, -1, -1, sym);
      statements(seq, flow.slice(0, -1), sym);
      if (seq.chunks.length) definitions.push([sym, seq.id, 0, HEADER]);
    } catch (error) {
      if (!(error instanceof UnsupportedConstruct)) throw error;
      skipped.set(name, error.construct);
      sequences.length = mark.sequences;
      chunkCount = mark.chunks;
      instructionCount = mark.instructions;
      words = mark.words;
      directJumps.length = mark.direct;
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
    blocks,
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
