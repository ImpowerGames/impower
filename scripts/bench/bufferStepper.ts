// A throwaway stepping loop over the binary program buffer (#664, #314). It
// exists to be measured against the story engine, and nothing that ships
// imports it. The position in the program is one integer, the index of a
// record in `ProgramBuffer.nodes`; no container, pointer or path object is
// built when a program arrives or while it runs.
//
// What it executes is the content a preview route is made of: text, string
// evaluation (`str` ... `/str`), expression evaluation (`ev` ... `/ev`), table
// construction (`obj{` ... `}obj`), the `display` builtin and the `line` marker
// ahead of it, `pop`, line ends with the engine's look-ahead past a newline,
// and `done` and `end`. A record of any other kind throws, naming itself.
// Left out: diverts and everything
// that follows a path, choices, threads, tunnels, function calls and call
// frames, variables, native operators, tags, glue, visit and turn counts,
// every builtin but `display`, errors and warnings, saved state.
import { NODE_WIDTH, ProgramNodeTag, type ProgramBuffer } from "../../packages/sparkdown/src/binary/programBinary";

const enum Op {
  Unsupported = 0,
  Text,
  Newline,
  EvalStart,
  EvalEnd,
  BeginString,
  EndString,
  BeginObject,
  EndObject,
  Pop,
  Display,
  LineStart,
  Stop,
}

const COMMAND_OPS: Record<string, Op> = {
  "\n": Op.Newline,
  ev: Op.EvalStart,
  "/ev": Op.EvalEnd,
  str: Op.BeginString,
  "/str": Op.EndString,
  "obj{": Op.BeginObject,
  "}obj": Op.EndObject,
  pop: Op.Pop,
  "stdlib:display:1": Op.Display,
  line: Op.LineStart,
  done: Op.Stop,
  end: Op.Stop,
};

/** What has to exist before the first step, built in one pass over the buffer. */
export interface ProgramIndex {
  /** Per interned string: the operation a String record holding it executes. */
  readonly opOfString: Uint8Array;
  /** Per interned string: the text a `^text` string outputs. */
  readonly textOfString: (string | undefined)[];
  /** Per record: the container (Array record) it is a child of, or -1. */
  readonly parent: Int32Array;
  /** Per record: 1 for the last child of a container, which holds its named
   *  content and flags (or null) and is never executed. */
  readonly terminator: Uint8Array;
  /** Per container: where its children start in `children`, whose entries are
   *  the child records in order, so `children[childStart[c] + n]` is the record
   *  an index component `n` of a path names inside container `c`. */
  readonly childStart: Int32Array;
  readonly children: Int32Array;
  /** Named containers, per owning container: the target of a name component
   *  of a path, as a record index. */
  readonly named: Map<number, Map<string, number>>;
  /** The record index of the root container. */
  readonly root: number;
}

export function buildProgramIndex(buffer: ProgramBuffer): ProgramIndex {
  const { nodes, strings } = buffer;
  const nodeCount = nodes.length / NODE_WIDTH;
  const opOfString = new Uint8Array(strings.length);
  const textOfString: (string | undefined)[] = new Array(strings.length);
  for (let s = 0; s < strings.length; s++) {
    const text = strings[s]!;
    if (text.charCodeAt(0) === 94 /* ^ */) {
      opOfString[s] = Op.Text;
      textOfString[s] = text.slice(1);
    } else {
      opOfString[s] = COMMAND_OPS[text] ?? Op.Unsupported;
    }
  }
  const parent = new Int32Array(nodeCount).fill(-1);
  const terminator = new Uint8Array(nodeCount);
  const childStart = new Int32Array(nodeCount);
  const children = new Int32Array(nodeCount);
  const named = new Map<number, Map<string, number>>();
  let root = -1;
  let childCursor = 0;
  for (let i = 0; i < nodeCount; i++) {
    const base = i * NODE_WIDTH;
    const tag = nodes[base]!;
    if (root < 0 && tag === ProgramNodeTag.Member && strings[nodes[base + 1]!] === "root") root = i + 1;
    if (tag !== ProgramNodeTag.Array) continue;
    const end = i + nodes[base + 2]!;
    childStart[i] = childCursor;
    let child = i + 1;
    let last = -1;
    while (child < end) {
      parent[child] = i;
      children[childCursor++] = child;
      last = child;
      child += nodes[child * NODE_WIDTH + 2]!;
    }
    if (last < 0) continue;
    terminator[last] = 1;
    if (nodes[last * NODE_WIDTH] !== ProgramNodeTag.Object) continue;
    // The terminator's members are the container's named content, beside its
    // `#f` flags and `#n` name.
    let names: Map<string, number> | undefined;
    let member = last + 1;
    const lastEnd = last + nodes[last * NODE_WIDTH + 2]!;
    while (member < lastEnd) {
      if (nodes[(member + 1) * NODE_WIDTH] === ProgramNodeTag.Array) {
        names ??= new Map();
        names.set(strings[nodes[member * NODE_WIDTH + 1]!]!, member + 1);
        parent[member + 1] = i;
      }
      member += nodes[member * NODE_WIDTH + 2]!;
    }
    if (names) named.set(i, names);
  }
  if (root < 0) throw new Error("the program has no root container");
  return { opOfString, textOfString, parent, terminator, childStart, children, named, root };
}

const OBJECT_MARKER = Symbol("obj{");

/** One beat's output: the text of the line and the tables `display` received. */
export interface BufferLine {
  text: string;
  tags: string[];
  display: Map<string, unknown>[];
}

export class BufferStepper {
  steps = 0;
  private cursor = -1;
  private readonly nodes: Uint16Array | Uint32Array;
  private readonly evalStack: unknown[] = [];
  // Output of the line being built. Inside `str` ... `/str` it also holds the
  // pieces of the string, above `stringMarks.at(-1)`.
  private readonly output: unknown[] = [];
  private readonly stringMarks: number[] = [];
  // The look-ahead past a newline: where the line ended, to return to once
  // later content proves the line is over. -1 while no newline is pending.
  private lineEndCursor = -1;
  private lineEndOutput = 0;
  private lineEndEval = 0;
  private lineOver = false;

  constructor(
    private readonly buffer: ProgramBuffer,
    private readonly index: ProgramIndex,
  ) {
    this.nodes = buffer.nodes;
  }

  /** Puts the cursor on the first content of a top-level named container. */
  start(name: string) {
    const target = this.index.named.get(this.index.root)?.get(name);
    if (target == null) throw new Error(`the program has no container named ${name}`);
    this.evalStack.length = 0;
    this.output.length = 0;
    this.stringMarks.length = 0;
    this.lineEndCursor = -1;
    this.lineOver = false;
    this.steps = 0;
    this.cursor = this.enter(target);
  }

  get canContinue() {
    return this.cursor >= 0;
  }

  // The first record at or after `at` that executes: containers are entered,
  // and a terminator is stepped over, which in a flat buffer lands on the
  // record after the container.
  private enter(at: number): number {
    const { nodes } = this;
    const { terminator } = this.index;
    const count = nodes.length / NODE_WIDTH;
    while (at < count) {
      if (terminator[at]) at += nodes[at * NODE_WIDTH + 2]!;
      else if (nodes[at * NODE_WIDTH] === ProgramNodeTag.Array) at += 1;
      else return at;
    }
    return -1;
  }

  /** Executes one record. True when the line is over. */
  step(): boolean {
    const { nodes } = this;
    const at = this.cursor;
    const base = at * NODE_WIDTH;
    this.steps++;
    if (nodes[base] !== ProgramNodeTag.String) throw new Error(`record ${at} has tag ${nodes[base]}, which the prototype does not execute`);
    const stringId = nodes[base + 1]!;
    let next = at + 1;
    switch (this.index.opOfString[stringId] as Op) {
      case Op.Text:
        this.emit(this.index.textOfString[stringId]!);
        break;
      case Op.Newline:
        this.emit("\n");
        break;
      case Op.EvalStart:
      case Op.EvalEnd:
        // Every record between them is dispatched by its own kind here, so
        // the mode switch has nothing to set.
        break;
      case Op.BeginString:
        this.stringMarks.push(this.output.length);
        break;
      case Op.EndString: {
        const mark = this.stringMarks.pop()!;
        const { output } = this;
        let text = "";
        for (let i = mark; i < output.length; i++) text += output[i];
        output.length = mark;
        this.evalStack.push(text);
        break;
      }
      case Op.BeginObject:
        this.evalStack.push(OBJECT_MARKER);
        break;
      case Op.EndObject: {
        const stack = this.evalStack;
        let marker = stack.length - 1;
        while (marker >= 0 && stack[marker] !== OBJECT_MARKER) marker--;
        if (marker < 0) throw new Error("}obj without obj{");
        const table = new Map<string, unknown>();
        for (let i = marker + 1; i + 1 < stack.length; i += 2) table.set(stack[i] as string, stack[i + 1]);
        stack.length = marker;
        stack.push(table);
        break;
      }
      case Op.Pop:
        this.evalStack.pop();
        break;
      case Op.Display: {
        const payload = this.evalStack.pop();
        if (payload) this.emit(payload);
        this.emit("\n");
        // The call's result, which the `pop` after it discards.
        this.evalStack.push(undefined);
        break;
      }
      case Op.LineStart:
        // A new display line proves the pending line is over, before its
        // argument is evaluated, as the engine's look-ahead stops there.
        if (this.stringMarks.length === 0 && this.lineEndCursor >= 0) this.lineOver = true;
        break;
      case Op.Stop:
        next = -1;
        break;
      default:
        throw new Error(`record ${at} is ${JSON.stringify(this.buffer.strings[stringId])}, which the prototype does not execute`);
    }
    if (this.lineOver) {
      // Content arrived after the newline, so the line ended there: go back
      // to it, as the engine restores its snapshot.
      this.lineOver = false;
      this.cursor = this.lineEndCursor;
      this.output.length = this.lineEndOutput;
      this.evalStack.length = this.lineEndEval;
      this.lineEndCursor = -1;
      return true;
    }
    this.cursor = next < 0 ? -1 : this.enter(next);
    if (this.stringMarks.length === 0 && this.lineEndCursor < 0 && this.output.at(-1) === "\n") {
      if (this.cursor < 0) return true;
      this.lineEndCursor = this.cursor;
      this.lineEndOutput = this.output.length;
      this.lineEndEval = this.evalStack.length;
    }
    return this.cursor < 0;
  }

  private emit(content: unknown) {
    if (this.stringMarks.length === 0 && this.lineEndCursor >= 0) {
      // Whitespace after a newline leaves the line open; anything else ends it.
      if (typeof content !== "string" || content.trim() !== "") this.lineOver = true;
    }
    this.output.push(content);
  }

  /** Steps to the end of the line and hands its output over. */
  continueLine(): BufferLine {
    while (this.cursor >= 0 && !this.step());
    return this.takeLine();
  }

  /** The finished line's output, which also clears it for the next line. */
  takeLine(): BufferLine {
    const line: BufferLine = { text: "", tags: [], display: [] };
    for (const content of this.output) {
      if (typeof content === "string") {
        line.text += content;
        continue;
      }
      // A table's `text` is part of the line's text, where the engine's
      // `currentText` reads it.
      const table = content as Map<string, unknown>;
      const text = table.get("text");
      if (typeof text === "string") line.text += text;
      line.display.push(table);
    }
    this.output.length = 0;
    return line;
  }
}
