// Loads the engine's modules in the order that settles their import cycle
// (see `CompilationAnnotator`).
import "../inkjs/engine/Container";
import type { ProgramTable } from "../binary/ProgramBinaryWriter";
import {
  bodyOfBlock,
  loopOf,
  type LoopShape,
} from "../compiler/lower/utils/statementShape";
import type { DebugMetadata } from "../inkjs/engine/DebugMetadata";
import { ControlCommand } from "../inkjs/engine/ControlCommand";
import { Conditional } from "../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import type { ConditionalSingleBranch } from "../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { CallValueExpression } from "../inkjs/compiler/Parser/ParsedHierarchy/Expression/CallValueExpression";
import { FunctionCall } from "../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Gather } from "../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import type { ParsedObject } from "../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { MultiVariableAssignment } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import type { VariableAssignment } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { Wrap } from "../inkjs/compiler/Parser/ParsedHierarchy/Wrap";
import { displayTableFlag } from "./displayCallFlags";
import { hash64 } from "./hash64";
import type {
  EmittedObject,
  ProgramEmitter,
  ProgramLabel,
} from "./ProgramEmitter";
import { UnsupportedConstruct } from "./ProgramEmitter";
import {
  AUX_MAX,
  ConstValue,
  JUMP_DECISION,
  LEAVE_CONTINUE,
  Op,
  OP_NAMES,
  SET_DECLARE,
  SET_GLOBAL,
  auxOf,
  encodeWord0,
  flagsOf,
  opOf,
} from "./ProgramInstructions";
import { internNumber, internString, internSymbol } from "./ProgramSymbols";
import {
  ANCHOR_STATEMENT,
  BLOCK_LOOP,
  BLOCK_ROW_WORDS,
  BLOCK_SCOPE_SHIFT,
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

/** One body of the statement being written: which body it is, the id of
 *  its sequence, and its lines. */
export interface BlockInput {
  /** The body as its lowering recorded it (`BodyShape`). */
  body: object;
  sequenceId: number;
  /** The lines of the owner's parts between the body above (or the
   *  statement's first line) and this body. */
  headLines: number;
  /** The body's first line in its script, counting from 0. */
  firstLine: number;
  /** The lines the body spans. */
  span: number;
}

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
  /** The bodies of a block statement, in the order it runs them. */
  blocks?: readonly BlockInput[];
  /** The column at which a line of the statement's script ends, for a row
   *  that ends where a body begins. */
  lineEnd?: (line: number) => number;
}

/** What the writer needs to emit a declaration statement's chunk. */
export interface DeclarationInput extends StatementInput {
  /** The globals the statement declares, in the order they initialize. */
  globals: readonly VariableAssignment[];
}

/** A statement the writer emitted. */
export interface EmittedStatement {
  chunk: StatementChunk;
  /** The values the emission recorded with `recordRead`, in order. */
  reads: readonly string[];
  /** The resolutions the emission recorded with `recordResolution`,
   *  sorted. */
  resolutions: readonly string[];
}

// A block of the chunk being written, as its `EnterBlock` left it.
interface BlockState {
  entered: boolean;
  flags: number;
  scopes: number;
  resume: ProgramLabel;
  break: ProgramLabel | null;
}

// A name the compiler generates, which it numbers by document order
// (`SparkdownCompiler.canonicalizeSyntheticFlowNames`).
const GENERATED_NAME = /^__synth_\d+$/;

/**
 * `BinaryProgramWriter` emits a statement's chunk from the statement's parsed
 * objects (docs/engine/binary-program.md, sections 1 and 3). Strings and
 * numbers are interned in the persistent `ProgramTable`, so a chunk minted in
 * one compile reads the same in the next.
 *
 * A block statement's code enters each of its bodies with `EnterBlock`; the
 * statements of a body are chunks of their own, which the store writes. A
 * name the compiler generated for a statement (a loop's hidden temporaries,
 * a multiple assignment's stashed values, a method call's receiver) is given
 * a name of the chunk's own, so that the chunk's content does not depend on
 * where its statement stands in the document.
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
  protected _resolutions: string[] = [];
  protected _references: number[] = [];
  protected _layout: string[] = [];
  protected _firstLine = 0;
  protected _blocks: readonly BlockInput[] = [];
  protected _lineEnd: ((line: number) => number) | undefined;
  protected _blockStates: (BlockState | undefined)[] = [];
  protected _fixups: { at: number; label: ProgramLabel }[] = [];
  protected _names = new Map<string, string>();
  protected _generated = 0;
  protected _scopes = 0;
  protected _ranges: (DebugMetadata | null)[] = [];

  /** `facts` gives, for a symbol, what the code that refers to it depends on
   *  (its kind and whether the program defines it); the chunk store reads the
   *  same function when it decides whether a chunk can be reused. */
  constructor(
    public readonly table: ProgramTable,
    public facts: (symbol: number) => string = () => "",
  ) {}

  write(input: StatementInput): EmittedStatement {
    this.begin(input);
    this.emitObjects(input.objects);
    return this.finish(input);
  }

  /** A declaration statement's chunk: each global's initializer, then its
   *  declaration as a global, as the current engine's `global decl`
   *  container initializes it. */
  writeDeclaration(input: DeclarationInput): EmittedStatement {
    this.begin(input);
    for (const global of input.globals) {
      if (!global.expression) {
        this.unsupported(global.typeName);
      }
      this.emitObject(global.expression);
      this.emit(
        Op.SetVar,
        this.variable(global.variableName),
        0,
        SET_DECLARE | SET_GLOBAL,
      );
    }
    return this.finish(input);
  }

  protected begin(input: StatementInput): void {
    this._code = [];
    this._rows = [];
    this._reads = [];
    this._resolutions = [];
    this._references = [];
    this._layout = [];
    this._firstLine = input.firstLine;
    this._blocks = input.blocks ?? [];
    this._lineEnd = input.lineEnd;
    this._blockStates = [];
    this._fixups = [];
    this._names = new Map();
    this._generated = 0;
    this._scopes = 0;
    this._ranges = [input.range];
    this.row(input.range);
  }

  protected finish(input: StatementInput): EmittedStatement {
    for (const { at, label } of this._fixups) {
      if (label.offset < 0) {
        this.unsupported("an unbound jump");
      }
      this._code[at + 1] = label.offset - (at + 2);
    }
    this._blocks.forEach((_, k) => {
      if (!this._blockStates[k]?.entered) {
        this.unsupported("a body the statement does not enter");
      }
    });
    const chunk = this.assemble(input);
    this.emitted += 1;
    return {
      chunk,
      reads: this._reads,
      resolutions: this._resolutions.sort(),
    };
  }

  // ------------------------------------------------------- ProgramEmitter

  emit(op: number, arg = 0, aux = 0, flags = 0): void {
    if (aux < 0 || aux > AUX_MAX || arg !== (arg | 0)) {
      this.unsupported(`an operand of ${OP_NAMES[op] ?? op}`);
    }
    this._code.push(encodeWord0(op, flags, aux), arg);
    this._layout.push(`${op}:${flags}:${aux}:${this.describeArg(op, arg)}`);
    if (op === Op.BeginScope) {
      this._scopes += 1;
    } else if (op === Op.EndScope) {
      this._scopes -= 1;
    }
  }

  emitObject(obj: EmittedObject, lineStart = false): void {
    const own = obj.ownDebugMetadata as DebugMetadata | null;
    if (own) {
      this._ranges.push(own);
      this.row(own);
    }
    if (lineStart) {
      this.emit(Op.LineStart);
    }
    obj.EmitProgram(this);
    if (own) {
      this._ranges.pop();
      this.row(this._ranges[this._ranges.length - 1] ?? null);
    }
  }

  jump(op: number, flags = 0, aux = 0): ProgramLabel {
    const label: ProgramLabel = { offset: -1 };
    this._fixups.push({ at: this._code.length, label });
    this.emit(op, 0, aux, flags);
    return label;
  }

  jumpBack(op: number, label: ProgramLabel, flags = 0): void {
    this._fixups.push({ at: this._code.length, label });
    this.emit(op, 0, 0, flags);
  }

  here(): ProgramLabel {
    return { offset: this._code.length };
  }

  bind(label: ProgramLabel): void {
    label.offset = this._code.length;
  }

  string(text: string): number {
    return internString(this.table, text);
  }

  number(value: number): number {
    return internNumber(this.table, value);
  }

  variable(name: string): number {
    let local = this._names.get(name);
    if (local === undefined) {
      local = GENERATED_NAME.test(name) ? `__t$${this._generated++}` : name;
      this._names.set(name, local);
    }
    return this.string(local);
  }

  aliasVariable(name: string, local: string): void {
    this._names.set(name, local);
  }

  recordRead(value: string): void {
    this._reads.push(value);
  }

  recordResolution(value: string): void {
    this._resolutions.push(value);
  }

  reference(symbol: number): void {
    for (let i = 0; i < this._references.length; i += REFERENCE_ROW_WORDS) {
      if (this._references[i] === symbol) {
        return;
      }
    }
    this._references.push(symbol, factHash(this.facts(symbol)));
  }

  symbol(name: string): number {
    return internSymbol(this.table, name);
  }

  enterBlock(body: object, flags = 0): number {
    const k = this._blocks.findIndex((block) => block.body === body);
    if (k < 0 || this._blockStates[k]?.entered) {
      this.unsupported("a body the statement does not record");
    }
    const resume: ProgramLabel = { offset: -1 };
    this._blockStates[k] = {
      entered: true,
      flags,
      scopes: this._scopes,
      resume,
      break: null,
    };
    this.emit(Op.EnterBlock, k);
    this.bind(resume);
    return k;
  }

  blockResume(block: number, label: ProgramLabel): void {
    this._blockStates[block]!.resume = label;
  }

  blockBreak(block: number, label: ProgramLabel): void {
    this._blockStates[block]!.break = label;
  }

  unsupported(construct: string): never {
    throw new UnsupportedConstruct(construct);
  }

  // ------------------------------------------------------ statement lists

  /** Emits the objects of a statement in order: a loop's objects as the
   *  loop's chunk code, a `do` block's scope around its body, and a
   *  `LineStart` ahead of every display call that starts a beat. */
  emitObjects(objects: readonly ParsedObject[]): void {
    for (let i = 0; i < objects.length; i += 1) {
      const obj = objects[i]!;
      const loop = loopOf.get(obj);
      if (loop) {
        this.expect(
          loop.objects.every((part, k) => objects[i + k] === part),
          "a loop",
        );
        this.emitLoop(loop);
        i += loop.objects.length - 1;
        continue;
      }
      const body = bodyOfBlock.get(obj);
      if (body) {
        // A `do` block: its scope, its body, and the scope's end.
        const objectsOfBody = body.statements.flatMap((s) => s.objects);
        this.requireHeld(objectsOfBody, objects);
        this.expect(
          objectsOfBody.every((part, k) => objects[i + 1 + k] === part),
          "a do block",
        );
        this.emitObject(obj);
        this.enterBlock(body);
        i += objectsOfBody.length;
        continue;
      }
      // Every display call that does not continue the line before it starts
      // a beat, which its `LineStart`, under the call's own line row, names.
      // A call whose text begins with `..` (`continues`) joins that beat
      // instead.
      this.emitObject(
        obj,
        obj instanceof FunctionCall &&
          obj.name === "display" &&
          !displayTableFlag(obj.args, "continues"),
      );
    }
  }

  /** Emits the content of a conditional's branch: the objects of its body,
   *  which are the statements of a block, as one `EnterBlock`, and the rest
   *  as the owner's code. */
  emitBranchBody(branch: object): void {
    const content = branchContent(branch as ConditionalSingleBranch);
    const body = bodyOfBlock.get(branch as ParsedObject);
    if (!body) {
      this.emitObjects(content);
      return;
    }
    const objectsOfBody = body.statements.flatMap((s) => s.objects);
    this.requireHeld(objectsOfBody, content);
    let start = objectsOfBody.length
      ? content.indexOf(objectsOfBody[0]!)
      : // An empty body stands inside the branch's scope.
        content.findIndex(isBeginScope) + 1;
    this.expect(
      start >= 0 &&
        objectsOfBody.every((part, k) => content[start + k] === part),
      "a branch's body",
    );
    this.emitObjects(content.slice(0, start));
    this.enterBlock(body);
    this.emitObjects(content.slice(start + objectsOfBody.length));
  }

  // --------------------------------------------------------------- loops

  /** A loop as one chunk: its hidden temporaries, the test of each pass as a
   *  decision, its body as a loop block whose natural end resumes where the
   *  next pass starts and whose `break` resumes after the loop. */
  protected emitLoop(loop: LoopShape): void {
    switch (loop.kind) {
      case "while":
        return this.emitWhile(loop);
      case "for":
        return this.emitFor(loop);
      case "forIn":
        return this.emitForIn(loop);
      case "repeat":
        return this.emitRepeat(loop);
    }
  }

  // The body objects of a loop, and the content of the loop's test branch.
  protected loopParts(loop: LoopShape): {
    body: ParsedObject[];
    test: readonly ParsedObject[];
  } {
    const body = loop.body.statements.flatMap((s) => s.objects);
    const test = branchContent(loop.test);
    this.requireHeld(body, [
      ...test,
      ...loop.objects.flatMap((obj) => obj.content ?? []),
    ]);
    return { body, test };
  }

  /** Names the first object of a body that the statement's code does not
   *  hold: a definition the compiler moves out of the code it is written
   *  in, as it moves a function defined inside a block. */
  protected requireHeld(
    body: readonly ParsedObject[],
    held: readonly ParsedObject[],
  ): void {
    const moved = body.find((obj) => !held.includes(obj));
    if (moved) {
      this.unsupported(moved.typeName);
    }
  }

  // Whether `list` is `before`, then `body`, then `after`.
  protected matches(
    list: readonly ParsedObject[],
    before: readonly ParsedObject[],
    body: readonly ParsedObject[],
    after: readonly ((obj: ParsedObject) => boolean)[],
  ): boolean {
    if (list.length !== before.length + body.length + after.length) {
      return false;
    }
    return (
      before.every((obj, k) => list[k] === obj) &&
      body.every((obj, k) => list[before.length + k] === obj) &&
      after.every((test, k) => test(list[before.length + body.length + k]!))
    );
  }

  // `while cond do BODY end`:
  //   head: cond; JumpIfFalse exit (a decision); Newline; EnterBlock 0 (a
  //   loop body that resumes at head); exit:
  protected emitWhile(loop: LoopShape): void {
    const [gather, breakGather] = loop.objects as [Gather, Gather];
    const { body, test } = this.loopParts(loop);
    this.expect(
      gather.content.length === 1 &&
        isConditionalOf(gather.content[0], loop.test) &&
        breakGather.content.length === 0 &&
        this.matches(test, [], body, [isDivert]),
      "a while loop",
    );
    const head = this.here();
    const exit = this.emitTest(loop.test);
    const k = this.enterBlock(loop.body, BLOCK_LOOP);
    this.blockResume(k, head);
    this.bind(exit);
    this.blockBreak(k, exit);
  }

  // `for i = a, b, c do BODY end`:
  //   BeginScope; the hidden index, stop and step; head: cond; JumpIfFalse
  //   exit; Newline; i = index; EnterBlock 0 (resumes at step); step: index
  //   += step; Jump head; exit: EndScope
  protected emitFor(loop: LoopShape): void {
    const [begin, , , , loopGather, stepGather, breakGather, end] =
      loop.objects as ParsedObject[];
    const { body, test } = this.loopParts(loop);
    this.expect(
      loop.objects.length === 8 &&
        isBeginScope(begin!) &&
        isEndScope(end!) &&
        loop.init.length === 3 &&
        loop.init.every((obj, k) => loop.objects[1 + k] === obj) &&
        loopGather!.content.length === 2 &&
        isConditionalOf(loopGather!.content[0], loop.test) &&
        isDivert(loopGather!.content[1]!) &&
        stepGather!.content.length === 2 &&
        stepGather!.content[0] === loop.step &&
        isDivert(stepGather!.content[1]!) &&
        breakGather!.content.length === 0 &&
        !!loop.copy &&
        this.matches(test, [loop.copy], body, [isDivert]),
      "a for loop",
    );
    const [index, stop, step] = loop.init as VariableAssignment[];
    this.aliasVariable(index!.variableName, "__forIdx$");
    this.aliasVariable(stop!.variableName, "__forStop$");
    this.aliasVariable(step!.variableName, "__forStep$");
    this.emitObject(begin!);
    this.emitObject(index!);
    this.emitObject(stop!);
    this.emitObject(step!);
    const head = this.here();
    const exit = this.emitTest(loop.test);
    this.emitObject(loop.copy!);
    const k = this.enterBlock(loop.body, BLOCK_LOOP);
    const next = this.here();
    this.blockResume(k, next);
    this.emitObject(loop.step!);
    this.jumpBack(Op.Jump, head);
    this.bind(exit);
    this.blockBreak(k, exit);
    this.emitObject(end!);
  }

  // `for k, v in f, s, c do BODY end`:
  //   BeginScope; iterator, state and control, then `__adjust_iter`; head:
  //   the call of the iterator into the loop variables; `v1 == nil`;
  //   JumpIfFalse next (a decision); Newline; Jump exit; next: control = v1;
  //   EnterBlock 0 (resumes at head); exit: EndScope
  protected emitForIn(loop: LoopShape): void {
    const [begin, init, adjust, loopGather, breakGather, end] =
      loop.objects as ParsedObject[];
    const { body, test } = this.loopParts(loop);
    const call = loop.call;
    const iterator = call?.expressions[0];
    this.expect(
      loop.objects.length === 6 &&
        isBeginScope(begin!) &&
        isEndScope(end!) &&
        loop.init.length === 2 &&
        loop.init[0] === init &&
        loop.init[1] === adjust &&
        init instanceof MultiVariableAssignment &&
        adjust instanceof MultiVariableAssignment &&
        !!call &&
        !!loop.update &&
        call.expressions.length === 1 &&
        iterator instanceof CallValueExpression &&
        breakGather!.content.length === 0 &&
        this.matches(
          loopGather!.content,
          [call, loopGather!.content[1]!, loop.update],
          body,
          [isDivert],
        ) &&
        isConditionalOf(loopGather!.content[1], loop.test) &&
        test.length === 1 &&
        isDivert(test[0]!),
      "a for-in loop",
    );
    const hidden = ["__forIn_iter$", "__forIn_state$", "__forIn_ctrl$"];
    (init as MultiVariableAssignment).targetAssignments.forEach((target, k) =>
      this.aliasVariable(target.variableName, hidden[k]!),
    );
    this.emitObject(begin!);
    this.emitObject(init!);
    this.emitObject(adjust!);
    const head = this.here();
    // The iterator is a value called with the state and the control: a
    // builtin iterator, a builtin, or a function.
    const callValue = iterator as CallValueExpression;
    for (const arg of callValue.args) {
      this.emitObject(arg);
    }
    this.emitObject(callValue.targetExpression);
    this.emit(Op.CallValue, 0, callValue.args.length);
    emitTargets(this, call!);
    const next = this.emitTest(loop.test);
    const exit = this.jump(Op.Jump);
    this.bind(next);
    this.emitObject(loop.update!);
    const k = this.enterBlock(loop.body, BLOCK_LOOP);
    this.blockResume(k, head);
    this.bind(exit);
    this.blockBreak(k, exit);
    this.emitObject(end!);
  }

  // `repeat BODY until cond`:
  //   BeginScope; head: EnterBlock 0 (resumes at test); test: not cond;
  //   JumpIfFalse exit (a decision); Newline; Jump head; exit: EndScope
  protected emitRepeat(loop: LoopShape): void {
    const [begin, loopGather, continueGather, breakGather, end] =
      loop.objects as ParsedObject[];
    const { body, test } = this.loopParts(loop);
    this.expect(
      loop.objects.length === 5 &&
        isBeginScope(begin!) &&
        isEndScope(end!) &&
        this.matches(loopGather!.content, [], body, [isDivert]) &&
        continueGather!.content.length === 1 &&
        isConditionalOf(continueGather!.content[0], loop.test) &&
        breakGather!.content.length === 0 &&
        test.length === 1 &&
        isDivert(test[0]!),
      "a repeat loop",
    );
    this.emitObject(begin!);
    const head = this.here();
    const k = this.enterBlock(loop.body, BLOCK_LOOP);
    const check = this.here();
    this.blockResume(k, check);
    const exit = this.emitTest(loop.test);
    this.jumpBack(Op.Jump, head);
    this.bind(exit);
    this.blockBreak(k, exit);
    this.emitObject(end!);
  }

  /** A loop's test: its condition, a jump past the pass when it is false,
   *  which is a decision as a conditional divert is, and the newline a
   *  branch that is not inline starts with. Returns the jump's label. */
  protected emitTest(test: ConditionalSingleBranch): ProgramLabel {
    this.expect(
      !!test.ownExpression &&
        !test.isElse &&
        !test.isTrueBranch &&
        !test.matchingEquality,
      "a loop's test",
    );
    this.emitObject(test.ownExpression!);
    const exit = this.jump(Op.JumpIfFalse, JUMP_DECISION);
    if (!test.isInline) {
      this.emit(Op.Newline);
    }
    return exit;
  }

  protected expect(condition: boolean, construct: string): asserts condition {
    if (!condition) {
      this.unsupported(construct);
    }
  }

  // -------------------------------------------------------------- internals

  /** Starts a line table row at the next instruction for `range`, unless the
   *  row in effect already covers that range. A row that covers no
   *  instruction yet gives way to the new one. A range below one of the
   *  statement's bodies counts from the end of that body. */
  protected row(range: DebugMetadata | null): void {
    if (!range) {
      return;
    }
    const rows = this._rows;
    const offset = this._code.length;
    if (rows.length > 0 && rows[rows.length - LINE_ROW_WORDS] === offset) {
      rows.length -= LINE_ROW_WORDS;
    }
    const start = range.startLineNumber - 1;
    let anchor = ANCHOR_STATEMENT;
    let base = this._firstLine;
    this._blocks.forEach((block, k) => {
      const end = block.firstLine + block.span;
      if (end <= start && end >= base) {
        anchor = k;
        base = end;
      }
    });
    // A row covers the statement's own parts: a range that runs into a body
    // below its start (a loop's objects span the whole loop) ends with the
    // line before the body, so that an edit inside the body changes no row.
    let end = range.endLineNumber - 1;
    let endColumn = Math.max(0, range.endCharacterNumber - 1);
    for (const block of this._blocks) {
      if (block.firstLine > start && block.firstLine <= end) {
        end = Math.max(start, block.firstLine - 1);
        endColumn = this._lineEnd?.(end) ?? 0;
        break;
      }
    }
    const firstLine = start - base;
    const lastLine = end - base;
    const startColumn = Math.max(0, range.startCharacterNumber - 1);
    if (rows.length > 0) {
      const last = rows.length - LINE_ROW_WORDS;
      if (
        rows[last + 1] === anchor &&
        rows[last + 2] === firstLine &&
        rows[last + 3] === startColumn &&
        rows[last + 4] === lastLine &&
        rows[last + 5] === endColumn
      ) {
        return;
      }
    }
    rows.push(offset, anchor, firstLine, startColumn, lastLine, endColumn);
  }

  protected describeArg(op: number, arg: number): string {
    switch (op) {
      case Op.Text:
      case Op.Str:
      case Op.CallStd:
      case Op.Native:
      case Op.GetVar:
      case Op.SetVar:
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
    const blocks: number[] = [];
    this._blocks.forEach((block, k) => {
      const state = this._blockStates[k]!;
      blocks.push(
        block.sequenceId,
        state.resume.offset,
        state.break ? state.break.offset : -1,
        (state.scopes << BLOCK_SCOPE_SHIFT) | state.flags,
        block.headLines,
      );
    });
    const references = this._references;
    const chunk = new Int32Array(
      HEADER_WORDS + code.length + rows.length + blocks.length + references.length,
    );
    chunk[H_CODE_WORDS] = code.length;
    chunk[H_LINE_ROWS] = rows.length / LINE_ROW_WORDS;
    chunk[H_EXPORT_ROWS] = 0;
    chunk[H_BLOCK_ROWS] = blocks.length / BLOCK_ROW_WORDS;
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
    chunk.set(blocks, HEADER_WORDS + code.length + rows.length);
    chunk.set(
      references,
      HEADER_WORDS + code.length + rows.length + blocks.length,
    );
    return chunk;
  }
}

/** The content of a conditional's branch, as its inner weave holds it. */
export const branchContent = (
  branch: ConditionalSingleBranch,
): readonly ParsedObject[] =>
  (branch as unknown as { _innerWeave: { content: ParsedObject[] } | null })
    ._innerWeave?.content ?? [];

/** A multiple assignment's targets: its values unpacked to as many as it
 *  has targets, and each target assigned in order, the first first. */
export const emitTargets = (
  emitter: ProgramEmitter,
  assignment: MultiVariableAssignment,
): void => {
  const targets = assignment.targetAssignments;
  emitter.emit(Op.Unpack, targets.length);
  for (const target of targets) {
    emitter.emit(
      Op.SetVar,
      emitter.variable(target.variableName),
      0,
      target.isNewTemporaryDeclaration ? SET_DECLARE : 0,
    );
  }
};

const isScope = (obj: ParsedObject, type: number): boolean =>
  obj instanceof Wrap &&
  (obj as unknown as { _objToWrap: unknown })._objToWrap instanceof
    ControlCommand &&
  ((obj as unknown as { _objToWrap: ControlCommand })._objToWrap
    .commandType as number) === type;

const isBeginScope = (obj: ParsedObject): boolean =>
  isScope(obj, ControlCommand.CommandType.BeginScope);

const isEndScope = (obj: ParsedObject): boolean =>
  isScope(obj, ControlCommand.CommandType.EndScope);

const isDivert = (obj: ParsedObject): boolean => obj instanceof Divert;

const isConditionalOf = (
  obj: ParsedObject | undefined,
  branch: ConditionalSingleBranch,
): boolean =>
  obj instanceof Conditional &&
  !obj.initialCondition &&
  obj.branches.length === 1 &&
  obj.branches[0] === branch;

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
  const flagText = flags ? ` flags ${flags}` : "";
  switch (op) {
    case Op.Text:
    case Op.Str:
      return `${name} ${JSON.stringify(table.strings[arg])}`;
    case Op.CallStd:
    case Op.Native:
      return `${name} ${table.strings[arg]}/${aux}${flagText}`;
    case Op.GetVar:
    case Op.SetVar:
      return `${name} ${table.strings[arg]}${flagText}`;
    case Op.Num:
      return `${name} ${table.numbers[arg]}${flags ? " float" : ""}`;
    case Op.Int:
    case Op.MakeTable:
    case Op.Pack:
    case Op.Unpack:
    case Op.EnterBlock:
      return `${name} ${arg}`;
    case Op.Jump:
    case Op.JumpIfFalse:
    case Op.JumpIfKeep:
      // The target, as an offset in the chunk's code.
      return `${name} ${offset + 2 + arg}${flagText}`;
    case Op.CallValue:
      return `${name} ${aux}`;
    case Op.Leave:
      return flags & LEAVE_CONTINUE ? `${name} continue` : name;
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
