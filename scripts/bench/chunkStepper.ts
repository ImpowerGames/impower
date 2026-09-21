// A throwaway stepping loop over the chunk layout of chunkProgram.ts (#693). It
// exists to be measured against the story engine, and nothing that ships
// imports it.
//
// The position is a sequence, an entry in it and a word offset into that
// entry's chunk. Values are the engine's own value classes and operators are
// the engine's own native calls, so an expression costs here what it would cost
// a real engine that keeps the value model. State that a look-ahead has to give
// back is held so that saving costs a few small copies and restoring costs what
// changed: the positional state is copied whole, because at the end of a line it
// is a handful of entries, and the variables and the counts keep an undo log
// while a save point is open.
//
// Left out: function calls and call frames, tunnels, threads, labels and
// diverts into a block (`resumeAt` rebuilds the block stack for a position
// handed to it, as one would), loops, glue, tags, every builtin but `display`,
// choice conditions, once-only and fallback choices, errors and warnings, the
// save format.
import type { InkObject } from "../../packages/sparkdown/src/inkjs/engine/Object";
import { NullValue, ObjectValue, StringValue, type AbstractValue } from "../../packages/sparkdown/src/inkjs/engine/Value";
import { B_RESUME, B_SEQUENCE, BLOCK_ROW, CHOICE_HAS_CHOICE_ONLY_CONTENT, CHOICE_HAS_START_CONTENT, FLAG_DISCARD, H_BLOCKS, H_CODE_WORDS, H_ID, HEADER, Op, position, type ProgramRoot, type Sequence } from "./chunkProgram";

export interface ChunkLine {
  text: string;
  tags: string[];
  display: ObjectValue[];
}

export interface ChunkChoice {
  text: string;
  seq: Sequence;
  index: number;
  pc: number;
  blockStack: number[];
}

const NEWLINE = "\n";
const NIL = new NullValue();

export class ChunkStepper {
  steps = 0;
  /** How many times a save point was opened, restored and forgotten. */
  saves = 0;
  restores = 0;
  forgets = 0;

  readonly globals = new Map<string, InkObject>();
  readonly visits: Uint32Array;
  readonly turns: Int32Array;
  turnIndex = 0;
  choices: ChunkChoice[] = [];

  private seq: Sequence | null = null;
  private index = 0;
  private chunk: Int32Array = new Int32Array(HEADER);
  private pc = HEADER;
  private end = HEADER;
  // Entered blocks, three numbers each: the owner's sequence id, its entry and
  // the position to resume at.
  private blockStack: number[] = [];
  private evalStack: InkObject[] = [];
  private output: unknown[] = [];
  private stringMarks: number[] = [];

  // The save point of the look-ahead past a line's newline.
  private saved = false;
  private savedSeq: Sequence | null = null;
  private savedIndex = 0;
  private savedPc = 0;
  private savedBlockStack: number[] = [];
  private savedEvalStack: InkObject[] = [];
  private savedOutput: unknown[] = [];
  private savedChoices = 0;
  private savedTurnIndex = 0;
  private undoNames: string[] = [];
  private undoValues: (InkObject | undefined)[] = [];
  private undoCounts: number[] = [];

  constructor(private readonly root: ProgramRoot) {
    this.visits = new Uint32Array(root.symbolNames.length);
    this.turns = new Int32Array(root.symbolNames.length).fill(-1);
  }

  private reset(globals: Iterable<[string, InkObject]>) {
    this.globals.clear();
    for (const [name, value] of globals) this.globals.set(name, value);
    this.visits.fill(0);
    this.turns.fill(-1);
    this.turnIndex = 0;
    this.choices = [];
    this.blockStack.length = 0;
    this.evalStack.length = 0;
    this.output.length = 0;
    this.stringMarks.length = 0;
    this.saved = false;
    this.undoNames.length = this.undoValues.length = this.undoCounts.length = 0;
    this.steps = this.saves = this.restores = this.forgets = 0;
  }

  start(flow: string, globals: Iterable<[string, InkObject]>) {
    this.reset(globals);
    const symbol = this.root.symbolNames.indexOf(flow);
    if (symbol < 0 || this.root.symSeq[symbol]! < 0) throw new Error(`the program defines no flow named ${flow}`);
    this.jump(symbol);
  }

  /** Starts at an address, as a position restored from an image does and as a
   *  divert into a block would: the root says which sequence holds the chunk
   *  and where, and the owners above it give the block stack, each through the
   *  root too, so that what is resumed when a block runs out is the sequence
   *  this root holds and not one the block was first built under. */
  resumeAt(chunkId: number, pc: number, globals: Iterable<[string, InkObject]>) {
    this.reset(globals);
    const root = this.root;
    const at = position(root, chunkId);
    if (!at) throw new Error(`the root holds no chunk ${chunkId}`);
    const stack: number[] = [];
    for (let seq = at.sequence; seq.owner >= 0; ) {
      const owner = position(root, seq.owner);
      if (!owner) throw new Error(`the root holds no chunk ${seq.owner}, which owns sequence ${seq.id}`);
      const chunk = owner.sequence.chunks[owner.entry]!;
      const row = HEADER + chunk[H_CODE_WORDS]! + seq.block * BLOCK_ROW;
      if (seq.block >= chunk[H_BLOCKS]! || chunk[row + B_SEQUENCE] !== seq.id) throw new Error(`chunk ${seq.owner} does not own sequence ${seq.id} as block ${seq.block}`);
      stack.unshift(owner.sequence.id, owner.entry, chunk[row + B_RESUME]!);
      seq = owner.sequence;
    }
    this.blockStack = stack;
    this.enter(at.sequence, at.entry, pc);
  }

  /** Where the engine is: the chunk and the offset of an address, and the
   *  sequence that holds the chunk. */
  get cursor(): { sequence: number; chunk: number; pc: number } | null {
    return this.seq && { sequence: this.seq.id, chunk: this.chunk[H_ID]!, pc: this.pc };
  }

  get canContinue() {
    return this.seq !== null;
  }

  private enter(seq: Sequence, index: number, pc: number) {
    const chunk = seq.chunks[index]!;
    this.seq = seq;
    this.index = index;
    this.chunk = chunk;
    this.pc = pc;
    this.end = HEADER + chunk[H_CODE_WORDS]!;
  }

  private count(symbol: number) {
    if (this.saved) this.undoCounts.push(symbol, this.visits[symbol]!, this.turns[symbol]!);
    this.visits[symbol]!++;
    this.turns[symbol] = this.turnIndex;
  }

  // A divert through a symbol: the root says which sequence, entry and position
  // define it. The symbols of this scene are flows, so the target has no owner
  // and the block stack is empty once there.
  private jump(symbol: number) {
    const root = this.root;
    const s = root.symSeq[symbol]!;
    if (s < 0) throw new Error(`divert to ${root.symbolNames[symbol]}, which the program does not define`);
    const seq = root.sequences[s]!;
    if (seq.owner >= 0) throw new Error("the prototype does not jump into a block");
    if (this.blockStack.length > 0) this.blockStack.length = 0;
    this.count(seq.flow);
    this.enter(seq, root.symIndex[symbol]!, root.symPc[symbol]!);
  }

  // The end of a chunk: the next statement of the sequence, or the owner of a
  // block that has run out, or nothing.
  private advance() {
    const seq = this.seq!;
    if (this.index + 1 < seq.chunks.length) {
      this.enter(seq, this.index + 1, HEADER);
      return;
    }
    const stack = this.blockStack;
    if (stack.length === 0) {
      this.seq = null;
      return;
    }
    const pc = stack.pop()!;
    const index = stack.pop()!;
    this.enter(this.root.sequences[stack.pop()!]!, index, pc);
  }

  save() {
    this.saved = true;
    this.saves++;
    this.savedSeq = this.seq;
    this.savedIndex = this.index;
    this.savedPc = this.pc;
    this.savedBlockStack = this.blockStack.slice();
    this.savedEvalStack = this.evalStack.slice();
    this.savedOutput = this.output.slice();
    this.savedChoices = this.choices.length;
    this.savedTurnIndex = this.turnIndex;
  }

  restore() {
    this.restores++;
    const { undoNames, undoValues, undoCounts, globals } = this;
    for (let i = undoNames.length - 1; i >= 0; i--) {
      const old = undoValues[i];
      if (old === undefined) globals.delete(undoNames[i]!);
      else globals.set(undoNames[i]!, old);
    }
    for (let i = undoCounts.length - 3; i >= 0; i -= 3) {
      this.visits[undoCounts[i]!] = undoCounts[i + 1]!;
      this.turns[undoCounts[i]!] = undoCounts[i + 2]!;
    }
    this.blockStack = this.savedBlockStack;
    this.evalStack = this.savedEvalStack;
    this.output = this.savedOutput;
    this.choices.length = this.savedChoices;
    this.turnIndex = this.savedTurnIndex;
    this.stringMarks.length = 0;
    if (this.savedSeq) this.enter(this.savedSeq, this.savedIndex, this.savedPc);
    else this.seq = null;
    this.close();
  }

  forget() {
    this.forgets++;
    this.close();
  }

  private close() {
    this.saved = false;
    this.undoNames.length = this.undoValues.length = this.undoCounts.length = 0;
  }

  private get endsInNewline() {
    return this.output.length > 0 && this.output[this.output.length - 1] === NEWLINE;
  }

  // A newline is not repeated and does not open a line.
  private newline() {
    if (this.output.length > 0 && !this.endsInNewline) this.output.push(NEWLINE);
  }

  /** Executes one instruction. True when the line is over. */
  step(): boolean {
    while (this.pc >= this.end) {
      this.advance();
      if (this.seq === null) return this.finish();
    }
    const chunk = this.chunk;
    const word = chunk[this.pc]!;
    const arg = chunk[this.pc + 1]!;
    this.pc += 2;
    this.steps++;
    const root = this.root;
    const stack = this.evalStack;
    switch ((word & 0xff) as Op) {
      case Op.LineStart:
        // New content is about to arrive. After a newline that ends the line
        // before it, and nothing of the new line has been evaluated.
        if (this.saved) {
          this.restore();
          return true;
        }
        break;
      case Op.Text:
        if (this.visible()) return true;
        this.output.push(root.strings[arg]!);
        break;
      case Op.Newline:
        if (this.stringMarks.length === 0) this.newline();
        else this.output.push(NEWLINE);
        break;
      case Op.Out: {
        if (this.visible()) return true;
        this.output.push(String(stack.pop()));
        break;
      }
      case Op.Num:
        stack.push(root.numberValues[arg]!);
        break;
      case Op.Str:
        stack.push(root.stringValues[arg]!);
        break;
      case Op.GetVar:
        stack.push(this.globals.get(root.strings[arg]!) ?? NIL);
        break;
      case Op.SetVar: {
        const name = root.strings[arg]!;
        if (this.saved) {
          this.undoNames.push(name);
          this.undoValues.push(this.globals.get(name));
        }
        this.globals.set(name, stack.pop()!);
        break;
      }
      case Op.BeginString:
        this.stringMarks.push(this.output.length);
        break;
      case Op.EndString: {
        const mark = this.stringMarks.pop()!;
        const output = this.output;
        let text = "";
        for (let i = mark; i < output.length; i++) text += output[i];
        output.length = mark;
        stack.push(new StringValue(text));
        break;
      }
      case Op.MakeTable: {
        const pairs = word >>> 16;
        const table = new Map<string, AbstractValue>();
        const from = stack.length - pairs * 2;
        for (let i = from; i < stack.length; i += 2) table.set((stack[i] as StringValue).value!, stack[i + 1] as AbstractValue);
        stack.length = from;
        stack.push(new ObjectValue(table));
        break;
      }
      case Op.Native: {
        const argc = word >>> 16;
        const result = root.natives[arg]!.Call(stack.splice(stack.length - argc, argc));
        stack.push(result!);
        break;
      }
      case Op.CallStd: {
        // `display`, the one builtin here: its table rides the output and a
        // newline closes the line.
        const payload = stack.pop();
        if (payload) this.output.push(payload);
        this.newline();
        if (!((word >>> 8) & FLAG_DISCARD)) stack.push(NIL);
        break;
      }
      case Op.Pop:
        stack.pop();
        break;
      case Op.Jump:
        this.pc += arg;
        break;
      case Op.JumpIfFalse:
        if (!(stack.pop() as AbstractValue).isTruthy) this.pc += arg;
        break;
      case Op.JumpSym:
        this.jump(arg);
        break;
      case Op.JumpDirect: {
        const target = root.direct[arg]!;
        if (this.blockStack.length > 0) this.blockStack.length = 0;
        this.count(target.symbol);
        this.enter(target.seq, 0, HEADER);
        break;
      }
      case Op.EnterBlock: {
        // The chunk names its block's sequence by id, and the root the engine
        // runs on says what that sequence holds.
        const child = root.sequences[chunk[this.end + arg * BLOCK_ROW + B_SEQUENCE]!]!;
        if (child.chunks.length === 0) break;
        this.blockStack.push(this.seq!.id, this.index, this.pc);
        this.enter(child, 0, HEADER);
        break;
      }
      case Op.BeginScope:
      case Op.EndScope:
        // The scene declares no local, so a scope holds nothing here.
        break;
      case Op.Choice: {
        const flags = (word >>> 8) & 0xff;
        const only = flags & CHOICE_HAS_CHOICE_ONLY_CONTENT ? (stack.pop() as StringValue).value! : "";
        const start = flags & CHOICE_HAS_START_CONTENT ? (stack.pop() as StringValue).value! : "";
        this.choices.push({ text: (start + only).trim(), seq: this.seq!, index: this.index, pc: this.pc + (word >>> 16), blockStack: this.blockStack.slice() });
        break;
      }
      case Op.Visit:
        this.count(arg);
        break;
      case Op.Done:
      case Op.End:
        this.seq = null;
        return this.finish();
      default:
        throw new Error(`instruction ${word & 0xff} at ${this.pc - 2} is not one the prototype executes`);
    }
    if (this.stringMarks.length === 0 && !this.saved && this.endsInNewline) this.save();
    return false;
  }

  // Content that a reader would see. After a newline it ends the line before it.
  private visible(): boolean {
    if (this.stringMarks.length > 0 || !this.saved) return false;
    this.restore();
    return true;
  }

  // The flow stopped. What ran past the last newline stays run: nothing can
  // extend the line any more.
  private finish(): boolean {
    if (this.saved) this.forget();
    return true;
  }

  choose(index: number) {
    const choice = this.choices[index];
    if (!choice) throw new Error(`there is no choice ${index}`);
    this.choices = [];
    this.turnIndex++;
    this.blockStack = choice.blockStack.slice();
    this.enter(choice.seq, choice.index, choice.pc);
  }

  /** Steps to the end of the line and hands its output over. */
  continueLine(): ChunkLine {
    while (this.seq !== null && !this.step());
    return this.takeLine();
  }

  /** The finished line's output, which also clears it for the next line. */
  takeLine(): ChunkLine {
    const line: ChunkLine = { text: "", tags: [], display: [] };
    for (const content of this.output) {
      if (typeof content === "string") line.text += content;
      else line.display.push(content as ObjectValue);
    }
    this.output = [];
    return line;
  }
}
