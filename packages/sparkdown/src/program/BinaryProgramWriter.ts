// Loads the engine's modules in the order that settles their import cycle
// (see `CompilationAnnotator`).
import "../inkjs/engine/Container";
import type { ProgramTable } from "../binary/ProgramBinaryWriter";
import type { DebugMetadata } from "../inkjs/engine/DebugMetadata";
import { FunctionCall } from "../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import type { ParsedObject } from "../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { displayTableFlag } from "./displayCallFlags";
import { hash64 } from "./hash64";
import type { ProgramEmitter } from "./ProgramEmitter";
import { UnsupportedConstruct } from "./ProgramEmitter";
import {
  AUX_MAX,
  ConstValue,
  Op,
  OP_NAMES,
  auxOf,
  encodeWord0,
  flagsOf,
  opOf,
} from "./ProgramInstructions";
import { internNumber, internString } from "./ProgramSymbols";
import {
  ANCHOR_STATEMENT,
  HEADER_WORDS,
  H_BLOCK_ROWS,
  H_CHUNK_ID,
  H_CODE_WORDS,
  H_EXPORT_ROWS,
  H_FINGERPRINT,
  H_LAYOUT_HASH,
  H_LINE_ROWS,
  H_REFERENCE_ROWS,
  LINE_ROW_WORDS,
  REFERENCE_ROW_WORDS,
  type StatementChunk,
} from "./StatementChunk";

/** What the writer needs to emit one statement's chunk. */
export interface StatementInput {
  /** The statement's parsed objects, in the order the statement runs them. */
  objects: readonly ParsedObject[];
  /** The statement's own source range, which covers its code where no
   *  object of it has a range of its own. Lines count from 1, as the parsed
   *  hierarchy's debug metadata holds them after assembly. */
  range: DebugMetadata | null;
  /** The statement's first line in its script, counting from 0. The line
   *  table is relative to it. */
  firstLine: number;
  /** The statement's source text, which its fingerprint hashes. */
  source: string;
  /** The id the chunk store gives the chunk. */
  chunkId: number;
}

/** A statement the writer emitted. */
export interface EmittedStatement {
  chunk: StatementChunk;
  /** The values the emission recorded with `recordRead`, in order. */
  reads: readonly string[];
}

/**
 * `BinaryProgramWriter` emits a statement's chunk from the statement's parsed
 * objects (docs/engine/binary-program.md, sections 1 and 3). Strings and
 * numbers are interned in the persistent `ProgramTable`, so a chunk minted in
 * one compile reads the same in the next.
 *
 * A statement that holds a construct the writer has no emit path for throws
 * `UnsupportedConstruct`, which names the construct.
 */
export class BinaryProgramWriter implements ProgramEmitter {
  /** How many chunks this writer has emitted. */
  emitted = 0;

  protected _code: number[] = [];
  protected _rows: number[] = [];
  protected _reads: string[] = [];
  protected _references: number[] = [];
  protected _layout: string[] = [];
  protected _firstLine = 0;

  /** `facts` gives, for a symbol, what the code that refers to it depends on
   *  (its kind and whether the program defines it); the chunk store reads the
   *  same function when it decides whether a chunk can be reused. */
  constructor(
    public readonly table: ProgramTable,
    public facts: (symbol: number) => string = () => "",
  ) {}

  write(input: StatementInput): EmittedStatement {
    this._code = [];
    this._rows = [];
    this._reads = [];
    this._references = [];
    this._layout = [];
    this._firstLine = input.firstLine;
    this.row(input.range);
    for (const obj of input.objects) {
      const own = obj.ownDebugMetadata;
      if (own) {
        this.row(own);
      }
      // Every display call that does not continue the line before it starts a
      // beat, which its `LineStart` names. A call whose text begins with `..`
      // (`continues`) joins that beat instead.
      if (
        obj instanceof FunctionCall &&
        obj.name === "display" &&
        !displayTableFlag(obj.args, "continues")
      ) {
        this.emit(Op.LineStart);
      }
      obj.EmitProgram(this);
      if (own) {
        this.row(input.range);
      }
    }
    const chunk = this.assemble(input);
    this.emitted += 1;
    return { chunk, reads: this._reads };
  }

  // ------------------------------------------------------- ProgramEmitter

  emit(op: number, arg = 0, aux = 0, flags = 0): void {
    if (aux < 0 || aux > AUX_MAX || arg !== (arg | 0)) {
      this.unsupported(`an operand of ${OP_NAMES[op] ?? op}`);
    }
    this._code.push(encodeWord0(op, flags, aux), arg);
    this._layout.push(`${op}:${flags}:${aux}:${this.describeArg(op, arg)}`);
  }

  string(text: string): number {
    return internString(this.table, text);
  }

  number(value: number): number {
    return internNumber(this.table, value);
  }

  recordRead(value: string): void {
    this._reads.push(value);
  }

  reference(symbol: number): void {
    for (let i = 0; i < this._references.length; i += REFERENCE_ROW_WORDS) {
      if (this._references[i] === symbol) {
        return;
      }
    }
    this._references.push(symbol, factHash(this.facts(symbol)));
  }

  unsupported(construct: string): never {
    throw new UnsupportedConstruct(construct);
  }

  // -------------------------------------------------------------- internals

  /** Starts a line table row at the next instruction for `range`, unless the
   *  row in effect already covers that range. A row that covers no
   *  instruction yet gives way to the new one. */
  protected row(range: DebugMetadata | null): void {
    if (!range) {
      return;
    }
    const rows = this._rows;
    const offset = this._code.length;
    if (rows.length > 0 && rows[rows.length - LINE_ROW_WORDS] === offset) {
      rows.length -= LINE_ROW_WORDS;
    }
    const firstLine = range.startLineNumber - 1 - this._firstLine;
    const lastLine = range.endLineNumber - 1 - this._firstLine;
    const startColumn = Math.max(0, range.startCharacterNumber - 1);
    const endColumn = Math.max(0, range.endCharacterNumber - 1);
    if (rows.length > 0) {
      const last = rows.length - LINE_ROW_WORDS;
      if (
        rows[last + 2] === firstLine &&
        rows[last + 3] === startColumn &&
        rows[last + 4] === lastLine &&
        rows[last + 5] === endColumn
      ) {
        return;
      }
    }
    rows.push(offset, ANCHOR_STATEMENT, firstLine, startColumn, lastLine, endColumn);
  }

  protected describeArg(op: number, arg: number): string {
    switch (op) {
      case Op.Text:
      case Op.Str:
      case Op.CallStd:
        return JSON.stringify(this.table.strings[arg]);
      case Op.Num:
        return String(this.table.numbers[arg]);
      default:
        return String(arg);
    }
  }

  protected assemble(input: StatementInput): StatementChunk {
    const code = this._code;
    const rows = this._rows;
    // The rows after the last instruction cover nothing, except the first row
    // of a statement that has no code.
    while (
      rows.length > LINE_ROW_WORDS &&
      rows[rows.length - LINE_ROW_WORDS]! >= code.length
    ) {
      rows.length -= LINE_ROW_WORDS;
    }
    const references = this._references;
    const chunk = new Int32Array(
      HEADER_WORDS + code.length + rows.length + references.length,
    );
    chunk[H_CODE_WORDS] = code.length;
    chunk[H_LINE_ROWS] = rows.length / LINE_ROW_WORDS;
    chunk[H_EXPORT_ROWS] = 0;
    chunk[H_BLOCK_ROWS] = 0;
    chunk[H_REFERENCE_ROWS] = references.length / REFERENCE_ROW_WORDS;
    chunk[H_CHUNK_ID] = input.chunkId;
    const fingerprint = hash64(normalizeSource(input.source));
    chunk[H_FINGERPRINT] = fingerprint[0];
    chunk[H_FINGERPRINT + 1] = fingerprint[1];
    const layout = hash64(this._layout.join("\n"));
    chunk[H_LAYOUT_HASH] = layout[0];
    chunk[H_LAYOUT_HASH + 1] = layout[1];
    chunk.set(code, HEADER_WORDS);
    chunk.set(rows, HEADER_WORDS + code.length);
    chunk.set(references, HEADER_WORDS + code.length + rows.length);
    return chunk;
  }
}

/** The hash a reference table row keeps of the facts about its symbol. */
export const factHash = (facts: string): number => hash64(facts)[1];

/** The source a fingerprint hashes: each line trimmed, and blank lines left
 *  out, so that re-indenting a statement keeps its fingerprint. */
export const normalizeSource = (source: string): string =>
  source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

/** One instruction of `chunk`'s code as text, for a listing or a test. */
export const describeInstruction = (
  chunk: StatementChunk,
  offset: number,
  table: ProgramTable,
): string => {
  const w0 = chunk[HEADER_WORDS + offset]!;
  const arg = chunk[HEADER_WORDS + offset + 1]!;
  const op = opOf(w0);
  const flags = flagsOf(w0);
  const aux = auxOf(w0);
  const name = OP_NAMES[op] ?? `op${op}`;
  switch (op) {
    case Op.Text:
    case Op.Str:
      return `${name} ${JSON.stringify(table.strings[arg])}`;
    case Op.CallStd:
      return `${name} ${table.strings[arg]}/${aux}${flags ? ` flags ${flags}` : ""}`;
    case Op.Num:
      return `${name} ${table.numbers[arg]}${flags ? " float" : ""}`;
    case Op.Int:
    case Op.MakeTable:
      return `${name} ${arg}`;
    case Op.Const:
      return `${name} ${CONST_NAMES[aux] ?? aux}`;
    default:
      return name;
  }
};

const CONST_NAMES: Record<number, string> = {
  [ConstValue.Nil]: "nil",
  [ConstValue.Void]: "void",
  [ConstValue.True]: "true",
  [ConstValue.False]: "false",
};
