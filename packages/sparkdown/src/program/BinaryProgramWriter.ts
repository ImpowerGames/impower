import type { ProgramTable } from "./ProgramTable";
import {
  bodyOfBlock,
  choiceBodyOf,
  functionShapeOf,
  inlineExitOf,
  inlinedBodies,
  loopExitUnwind,
  loopOf,
  type LoopShape,
} from "../compiler/lower/utils/statementShape";
import type { DebugMetadata } from "../runtime/DebugMetadata";
import { Choice } from "../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import { ControlCommand } from "../runtime/ControlCommand";
import { Conditional } from "../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import type { ConditionalSingleBranch } from "../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { CallValueExpression } from "../inkjs/compiler/Parser/ParsedHierarchy/Expression/CallValueExpression";
import type { FlowBase } from "../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import { FunctionCall } from "../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Gather } from "../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import type { ParsedObject } from "../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { MultiVariableAssignment } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import type { VariableAssignment } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { Wrap } from "../inkjs/compiler/Parser/ParsedHierarchy/Wrap";
import { displayTableFlag } from "./displayCallFlags";
import { hash64 } from "./hash64";
import { heldObjectsOf } from "./programFlows";
import type {
  EmittedObject,
  ProgramEmitter,
  ProgramLabel,
} from "./ProgramEmitter";
import { UnsupportedConstruct } from "./ProgramEmitter";
import { FACT_KIND } from "./ProgramFacts";
import {
  AUX_MAX,
  CALL_METHOD,
  CHOICE_CONDITION,
  CHOICE_DECISION,
  CHOICE_INVISIBLE_DEFAULT,
  CHOICE_ONCE,
  CHOICE_ONLY,
  CHOICE_START,
  ConstValue,
  DONE_HOLD,
  JUMP_DECISION,
  LEAVE_CONTINUE,
  Op,
  OP_NAMES,
  SET_DECLARE,
  SET_GLOBAL,
  SET_VARARGS,
  SET_ROOT_SLOTTED,
  auxOf,
  encodeWord0,
  flagsOf,
  opOf,
} from "./ProgramInstructions";
import {
  anonymousSymbol,
  internNumber,
  internString,
  internSymbol,
  isAnonymousSymbol,
  NUMBERED_SYNTHETIC_NAME,
} from "./ProgramSymbols";
import {
  ADDRESS_OFFSETS,
  ANCHOR_STATEMENT,
  BLOCK_CHOICE,
  BLOCK_FUNCTION,
  BLOCK_LOOP,
  BLOCK_PASS_SCOPE,
  BLOCK_ROW_WORDS,
  BLOCK_SCOPE_SHIFT,
  BLOCK_THEN,
  EXPORT_ROW_WORDS,
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
  exportCount,
  exportSymbol,
  type ProgramChunk,
} from "./ProgramChunk";

export interface BlockInput {
  body: object;
  sequenceId: number;
  headLines: number;
  firstLine: number;
  span: number;
  fn?: FunctionInput;
}

export interface FunctionInput {
  symbol: number;
  params: readonly { name: string; vararg: boolean; rootSlot?: string | null }[];
  hoisted: readonly ParsedObject[];
  range: DebugMetadata | null;
}

export interface StatementInput {
  objects: readonly ParsedObject[];
  range: DebugMetadata | null;
  firstLine: number;
  source: string;
  fingerprint: string;
  chunkId: number;
  blocks?: readonly BlockInput[];
  lineEnd?: (line: number) => number;
  definesOnly?: boolean;
}

export interface DeclarationInput extends StatementInput {
  globals: readonly { name: string; assignment: VariableAssignment }[];
}

export interface EmittedStatement {
  chunk: ProgramChunk;
  reads: readonly string[];
  resolutions: readonly string[];
  facts: ReadonlyMap<number, readonly string[]>;
}

interface ChooseState {
  entries: {
    choice: Choice;
    label: ProgramLabel;
    symbol: number;
    named: boolean;
    body: object | undefined;
    scopes: number;
    join: ProgramLabel | null;
  }[];
  clauses: {
    label: ProgramLabel;
    gather: Gather;
    scopes: number;
    join: ProgramLabel | null;
  }[];
  join: ProgramLabel | null;
  end: ProgramLabel;
}

interface InlineLoop {
  loop: LoopShape;
  scopes: number;
  exit: ProgramLabel;
  next: ProgramLabel;
}

interface BlockState {
  entered: boolean;
  flags: number;
  scopes: number;
  resume: ProgramLabel;
  break: ProgramLabel | null;
}

const GENERATED_NAME = NUMBERED_SYNTHETIC_NAME;

export class BinaryProgramWriter implements ProgramEmitter {
  emitted = 0;

  protected _code: number[] = [];
  protected _rows: number[] = [];
  protected _reads: string[] = [];
  protected _resolutions: string[] = [];
  protected _references = new Map<number, Map<string, string>>();
  protected _layout: string[] = [];
  protected _firstLine = 0;

  protected _source = "";
  protected _sourceLines: string[] | undefined;
  protected _blocks: readonly BlockInput[] = [];
  protected _lineEnd: ((line: number) => number) | undefined;
  protected _blockStates: (BlockState | undefined)[] = [];
  protected _fixups: { at: number; label: ProgramLabel }[] = [];
  protected _names = new Map<string, string>();
  protected _generated = 0;
  protected _scopes = 0;
  protected _ranges: (DebugMetadata | null)[] = [];
  protected _exports: number[] = [];
  protected _definesOnly = false;
  protected _alternators: number[] = [];
  protected _choices: number[] = [];
  protected _choose: ChooseState | null = null;
  protected _inlineLoops: InlineLoop[] = [];

  constructor(
    public readonly table: ProgramTable,
    public facts: (symbol: number, name: string) => string = () => "",
    public symbolOf: (fn: object) => number | undefined = () => undefined,
    public alternatorOf: (sequence: object) => number = () =>
      anonymousSymbol(table),
  ) {}

  write(input: StatementInput): EmittedStatement {
    this.begin(input);
    if (!input.definesOnly) {
      this.emitObjects(input.objects);
    }
    return this.finish(input);
  }

  writeDeclaration(input: DeclarationInput): EmittedStatement {
    this.begin(input);
    const { globals } = input;
    let declared = 0;
    for (let i = 0; i < globals.length; ) {
      const statement = globals[i]!.assignment.statementGlobals;
      const groups: (string | null)[][] = [];
      do {
        const { name, assignment } = globals[i]!;
        if (declared !== i) {
          this.emit(Op.DeclareValue, i);
          declared = i;
        }
        if (!assignment.expression) {
          this.unsupported(assignment.typeName);
        }
        this.emitObject(assignment.expression);
        for (const discarded of assignment.discarded) {
          this.emitObject(discarded);
          this.emit(Op.Pop);
        }
        const spread = assignment.spreadTo;
        if (spread.length > 0) {
          this.emit(Op.Unpack, spread.length + 1);
        }
        const group: (string | null)[] = [name];
        for (const target of spread) {
          const next = globals[i + 1];
          if (next?.assignment === target) {
            group.push(next.name);
            i += 1;
          } else if (globals.some((g) => g.assignment === target)) {
            this.unsupported("a store whose names its call gives values to are apart");
          } else {
            group.push(null);
          }
        }
        groups.push(group);
        i += 1;
      } while (
        statement.length > 0 &&
        i < globals.length &&
        globals[i]!.assignment.statementGlobals === statement
      );
      for (let g = groups.length - 1; g >= 0; g -= 1) {
        for (const name of groups[g]!) {
          if (name === null) {
            this.emit(Op.Pop);
          } else {
            this.emit(Op.SetVar, this.variable(name), 0, SET_DECLARE | SET_GLOBAL);
            declared += 1;
          }
        }
      }
    }
    return this.finish(input);
  }

  protected begin(input: StatementInput): void {
    this._code = [];
    this._rows = [];
    this._reads = [];
    this._resolutions = [];
    this._references = new Map();
    this._layout = [];
    this._firstLine = input.firstLine;
    this._sourceLines = undefined;
    this._source = input.source;
    this._blocks = input.blocks ?? [];
    this._lineEnd = input.lineEnd;
    this._blockStates = [];
    this._fixups = [];
    this._names = new Map();
    this._generated = 0;
    this._scopes = 0;
    this._ranges = [input.range];
    this._exports = [];
    this._definesOnly = input.definesOnly ?? false;
    this._alternators = [];
    this._choices = [];
    this._choose = null;
    this._inlineLoops = [];
    this.row(input.range);
  }

  protected finish(input: StatementInput): EmittedStatement {
    this.emitFunctionEntries();
    if (this._code.length >= ADDRESS_OFFSETS) {
      this.unsupported("a statement longer than an address holds");
    }
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
    const facts = new Map<number, string[]>();
    for (const [symbol, read] of this._references) {
      if (read.size > 0) {
        facts.set(symbol, [...read.keys()].sort());
      }
    }
    return {
      chunk,
      reads: this._reads,
      resolutions: [...new Set(this._resolutions)].sort(),
      facts,
    };
  }

  emit(op: number, arg = 0, aux = 0, flags = 0): void {
    if (aux < 0 || aux > AUX_MAX || arg !== (arg | 0)) {
      this.unsupported(`an operand of ${OP_NAMES[op] ?? op}`);
    }
    this._code.push(encodeWord0(op, flags, aux), arg);
    if (op === Op.CallValue) {
      this._layout.push(`${op}:${flags & ~CALL_METHOD}:${aux}:0`);
    } else {
      this._layout.push(`${op}:${flags}:${aux}:${this.describeArg(op, arg)}`);
    }
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

  emitLoopExit(divert: object, exit: "break" | "continue"): void {
    const target = inlineExitOf.get(divert as ParsedObject);
    if (!target) {
      this.emit(Op.Leave, 0, 0, exit === "continue" ? LEAVE_CONTINUE : 0);
      return;
    }
    const loop = this._inlineLoops[this._inlineLoops.length - 1];
    if (loop?.loop !== target) {
      this.unsupported("a break or continue inside a choice's body");
    }
    this.expect(this._scopes === loop.scopes, "a loop exit");
    const before =
      this._scopes + (loopExitUnwind.get(divert as ParsedObject) ?? 0);
    this.jumpBack(Op.Jump, exit === "continue" ? loop.next : loop.exit);
    this.alignScopes(before);
  }

  protected here(): ProgramLabel {
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

  protected aliasVariable(name: string, local: string): void {
    this._names.set(name, local);
  }

  recordRead(value: string): void {
    this._reads.push(value);
  }

  recordResolution(value: string): void {
    this._resolutions.push(value);
  }

  fact(symbol: number, name: string): string {
    let read = this._references.get(symbol);
    if (!read) {
      read = new Map();
      this._references.set(symbol, read);
    }
    let value = read.get(name);
    if (value === undefined) {
      value = this.facts(symbol, name);
      read.set(name, value);
    }
    return value;
  }

  reference(symbol: number): void {
    this.fact(symbol, FACT_KIND);
  }

  referenceTarget(symbol: number): void {
    if (!this._references.has(symbol)) {
      this._references.set(symbol, new Map());
    }
  }

  targetSymbol(target: object | null, written: string): number {
    if (target) {
      const name = (target as ParsedObject).programSymbolName;
      if (name === null) {
        this.unsupported((target as ParsedObject).typeName);
      }
      return internSymbol(this.table, name);
    }
    return internSymbol(this.table, written);
  }

  labelSymbol(gather: object): number {
    const name = (gather as ParsedObject).programSymbolName;
    if (name === null) {
      this.unsupported("a label inside a function");
    }
    return internSymbol(this.table, name);
  }

  alternatorSymbol(sequence: object): number {
    const symbol = this.alternatorOf(sequence);
    if (!this._alternators.includes(symbol)) {
      this._alternators.push(symbol);
    }
    return symbol;
  }

  exportHere(symbol: number): void {
    this._exports.push(symbol, this._code.length);
  }

  protected enterBlock(body: object, flags = 0): number {
    const k = this._blocks.findIndex((block) => block.body === body);
    if (k < 0 || this._blockStates[k]?.entered) {
      this.unsupported("a body the statement does not record");
    }
    if (
      this._choose &&
      heldObjectsOf(body as Parameters<typeof heldObjectsOf>[0]).some(
        raisesChoice,
      )
    ) {
      this.unsupported("a choice inside a block of a presentation");
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

  protected blockResume(block: number, label: ProgramLabel): void {
    this._blockStates[block]!.resume = label;
  }

  protected blockBreak(block: number, label: ProgramLabel): void {
    this._blockStates[block]!.break = label;
  }

  functionSymbol(fn: object): number {
    const symbol = this.symbolOf(fn);
    if (symbol === undefined) {
      this.unsupported("a function the program does not define");
    }
    return symbol;
  }

  emitFunctionInPlace(fn: object): void {
    const flow = fn as FlowBase;
    const shape = functionShapeOf.get(flow);
    if (!shape) {
      this.unsupported(flow.typeName);
    }
    this.emitParameters(
      (flow.args ?? []).map((arg) => ({
        name: arg.identifier?.name ?? "",
        vararg: !!arg.isVararg,
      })),
      shape.hoisted,
    );
    this.enterBlock(shape.body);
  }

  bindParameters(params: FunctionInput["params"]): void {
    for (let p = params.length - 1; p >= 0; p -= 1) {
      const param = params[p]!;
      this.emit(
        Op.SetVar,
        this.variable(param.name),
        0,
        SET_DECLARE |
          (param.vararg ? SET_VARARGS : 0) |
          (param.rootSlot ? SET_ROOT_SLOTTED : 0),
      );
    }
    for (const param of params) {
      if (param.rootSlot) {
        this.emit(Op.VarPtr, this.variable(param.name));
        this.emit(Op.SetVar, this.variable(param.rootSlot), 0, SET_DECLARE);
      }
    }
  }

  protected emitParameters(
    params: FunctionInput["params"],
    hoisted: readonly ParsedObject[],
  ): void {
    this.bindParameters(params);
    for (const local of hoisted) {
      this.emitObject(local as ParsedObject);
    }
  }

  protected emitFunctionEntries(): void {
    const entries = this._blocks
      .map((block, k) => (block.fn && !this._blockStates[k]?.entered ? k : -1))
      .filter((k) => k >= 0);
    if (entries.length === 0) {
      return;
    }
    const end = this._definesOnly ? null : this.jump(Op.Jump);
    for (const k of entries) {
      const block = this._blocks[k]!;
      const fn = block.fn!;
      this._ranges.push(fn.range);
      this.row(fn.range);
      this.alignScopes(0);
      this._exports.push(fn.symbol, this._code.length);
      this.emitParameters(fn.params, fn.hoisted);
      this.enterBlock(block.body, BLOCK_FUNCTION);
      this.emit(Op.Const, 0, ConstValue.Void);
      this.emit(Op.Return);
      this._ranges.pop();
    }
    if (end) {
      this.bind(end);
    }
  }

  unsupported(construct: string): never {
    throw new UnsupportedConstruct(construct);
  }

  emitObjects(objects: readonly ParsedObject[]): void {
    for (let i = 0; i < objects.length; i += 1) {
      const obj = objects[i]!;
      if (obj instanceof Choice) {
        if (!this._choose) {
          this.unsupported(obj.typeName);
        }
        let end = i + 1;
        while (
          end < objects.length &&
          !(objects[end] instanceof Choice) &&
          !opensChoices(objects[end]!)
        ) {
          end += 1;
        }
        if (
          end < objects.length &&
          objects.slice(i + 1, end).some((part) => part instanceof Gather)
        ) {
          this.unsupported("a label between choices an if gates");
        }
        this.emitObjects(this.emitChoicePoint(obj, objects.slice(i + 1, end)));
        i = end - 1;
        continue;
      }
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
        const objectsOfBody = heldObjectsOf(body);
        this.requireHeld(objectsOfBody, objects);
        this.expect(
          objectsOfBody.every((part, k) => objects[i + 1 + k] === part),
          "a do block",
        );
        this.emitObject(obj);
        if (inlinedBodies.has(body)) {
          this.emitObjects(objectsOfBody);
        } else {
          this.enterBlock(body);
        }
        i += objectsOfBody.length;
        continue;
      }
      this.emitObject(
        obj,
        obj instanceof FunctionCall &&
          obj.name === "display" &&
          !displayTableFlag(obj.args, "continues"),
      );
    }
  }

  emitBranchBody(branch: object): void {
    const content = branchContent(branch as ConditionalSingleBranch);
    const body = bodyOfBlock.get(branch as ParsedObject);
    if (!body) {
      this.emitObjects(content);
      return;
    }
    const objectsOfBody = heldObjectsOf(body);
    this.requireHeld(objectsOfBody, content);
    let start = objectsOfBody.length
      ? content.indexOf(objectsOfBody[0]!)
      :
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

  emitChoose(weaveObject: object): void {
    const weave = weaveObject as ParsedObject;
    const content = weave.content;
    const gather = content[content.length - 1];
    if (this._choose || !(gather instanceof Gather)) {
      this.unsupported("a choose block in another's preamble");
    }
    const end: ProgramLabel = { offset: -1 };
    const presentation: ChooseState = {
      entries: [],
      clauses: [],
      join: null,
      end,
    };
    this._choose = presentation;
    this.emitObjects(content.slice(0, -1));
    this._choose = null;
    this.emit(Op.Done, 0, 0, DONE_HOLD);
    this.jumpBack(Op.Jump, end);
    const depth = this._scopes;
    const depthAt = (join: ProgramLabel | null) =>
      join
        ? presentation.clauses.find((clause) => clause.label === join)!.scopes
        : depth;
    presentation.entries.forEach((entry) => {
      this.alignScopes(entry.scopes);
      this.bind(entry.label);
      this.withRange(entry.choice.ownDebugMetadata as DebugMetadata | null, () => {
        if (entry.named) {
          this.recordResolution(entry.choice.programResolutionKey);
          this.exportHere(entry.symbol);
        }
        this.emit(Op.Visit, entry.symbol);
        this.emitChoiceEntry(entry.choice, entry.body);
        this.closeScopes(depthAt(entry.join));
      });
      this.jumpBack(Op.Jump, entry.join ?? end);
    });
    presentation.clauses.forEach((clause) => {
      this.alignScopes(clause.scopes);
      this.bind(clause.label);
      this.emitThenClause(clause.gather);
      this.closeScopes(depthAt(clause.join));
      this.jumpBack(Op.Jump, clause.join ?? end);
    });
    this.alignScopes(depth);
    this.bind(end);
    this.emitThenClause(gather);
  }

  protected emitThenClause(gather: Gather): void {
    this.withRange(this.clauseRangeOf(gather), () => {
      if (gather.name) {
        this.recordResolution(gather.programResolutionKey);
        const symbol = this.labelSymbol(gather);
        this.exportHere(symbol);
        this.emit(Op.Visit, symbol);
      }
      this.emitWithBody(
        gather.content,
        choiceBodyOf.get(gather),
        BLOCK_THEN,
        "a then clause",
      );
    });
  }

  protected closeScopes(scopes: number): void {
    this.expect(this._scopes >= scopes, "a choice's scopes");
    while (this._scopes > scopes) {
      this.emit(Op.EndScope);
    }
  }

  protected alignScopes(scopes: number): void {
    while (this._scopes < scopes) {
      this.emit(Op.BeginScope);
    }
    while (this._scopes > scopes) {
      this.emit(Op.EndScope);
    }
  }

  emitPreambleChoose(weaveObject: object): void {
    const weave = weaveObject as ParsedObject;
    if (!this._choose) {
      this.unsupported("Choice");
    }
    const content = weave.content;
    const last = content[content.length - 1];
    const gather =
      last instanceof Gather && choiceBodyOf.has(last) ? last : null;
    const items = gather ? content.slice(0, -1) : content;
    const presentation = this._choose;
    const outer = presentation.join;
    const scopes = this._scopes;
    const label: ProgramLabel | null = gather ? { offset: -1 } : null;
    presentation.join = label ?? outer;
    this.emitObjects(items);
    presentation.join = outer;
    this.expect(this._scopes === scopes, "a block of a presentation");
    if (gather) {
      presentation.clauses.push({ label: label!, gather, scopes, join: outer });
    }
  }

  protected emitChoicePoint(
    choice: Choice,
    inline: readonly ParsedObject[],
  ): readonly ParsedObject[] {
    const presentation = this._choose!;
    const body = choiceBodyOf.get(choice);
    const held = body
      ? heldObjectsOf(body as Parameters<typeof heldObjectsOf>[0])
      : [];
    const inBranch =
      held.length > 0 && !choice.innerContent.content.includes(held[0]!);
    this.expect(
      !inBranch || held.every((part, k) => inline[k] === part),
      "a choice's body",
    );
    const rest = inBranch ? inline.slice(held.length) : inline;
    this.expect(
      (body !== undefined || inline.length === 0) &&
        rest.every((part) => isBeginScope(part) || isEndScope(part)),
      "a choice's body",
    );
    this.withRange(choice.ownDebugMetadata as DebugMetadata | null, () => {
      let flags = 0;
      if (choice.startContent.content.length > 0) {
        this.emit(Op.BeginString);
        this.emitObjects(choice.startContent.content);
        this.emit(Op.EndString);
        flags |= CHOICE_START;
      }
      if (choice.choiceOnlyContent.content.length > 0) {
        this.emit(Op.BeginString);
        this.emitObjects(choice.choiceOnlyContent.content);
        this.emit(Op.EndString);
        flags |= CHOICE_ONLY;
      }
      if (choice.condition) {
        this.emitObject(choice.condition);
        flags |= CHOICE_CONDITION | CHOICE_DECISION;
      }
      if (choice.onceOnly) {
        flags |= CHOICE_ONCE;
      }
      if (choice.isInvisibleDefault) {
        flags |= CHOICE_INVISIBLE_DEFAULT;
      }
      const named = !!choice.name;
      const symbol = named ? this.labelSymbol(choice) : this.choiceSymbol(choice);
      const label = this.jump(Op.Choice, flags);
      presentation.entries.push({
        choice,
        label,
        symbol,
        named,
        body: inBranch ? body : undefined,
        scopes: this._scopes,
        join: presentation.join,
      });
    });
    return rest;
  }

  protected emitChoiceEntry(choice: Choice, branchBody: object | undefined): void {
    const content = choice.innerContent.content;
    if (!branchBody) {
      this.emitWithBody(
        content,
        choiceBodyOf.get(choice),
        BLOCK_CHOICE,
        "a choice's body",
      );
      return;
    }
    this.emitObjects(content);
    this.enterBlock(branchBody, BLOCK_CHOICE);
  }

  protected choiceSymbol(choice: Choice): number {
    const symbol = this.alternatorOf(choice);
    if (!this._choices.includes(symbol)) {
      this._choices.push(symbol);
    }
    return symbol;
  }

  protected emitWithBody(
    content: readonly ParsedObject[],
    body: object | undefined,
    flags: number,
    construct: string,
  ): void {
    if (!body) {
      this.emitObjects(content);
      return;
    }
    const held = heldObjectsOf(body as Parameters<typeof heldObjectsOf>[0]);
    this.requireHeld(held, content);
    const start = held.length > 0 ? content.indexOf(held[0]!) : content.length;
    this.expect(
      start >= 0 &&
        start + held.length === content.length &&
        held.every((part, k) => content[start + k] === part),
      construct,
    );
    this.emitObjects(content.slice(0, start));
    this.enterBlock(body, flags);
  }

  protected clauseRangeOf(gather: Gather): DebugMetadata | null {
    const own = gather.ownDebugMetadata as DebugMetadata | null;
    if (own) {
      return own;
    }
    const body = choiceBodyOf.get(gather);
    const block = body ? this._blocks.find((b) => b.body === body) : undefined;
    if (!block || block.headLines <= 0) {
      return null;
    }
    const last = block.firstLine - 1;
    return {
      startLineNumber: block.firstLine - block.headLines + 1,
      startCharacterNumber: 1,
      endLineNumber: last + 1,
      endCharacterNumber: (this._lineEnd?.(last) ?? 0) + 1,
    } as DebugMetadata;
  }

  protected withRange(range: DebugMetadata | null, emit: () => void): void {
    if (range) {
      this._ranges.push(range);
      this.row(range);
    }
    emit();
    if (range) {
      this._ranges.pop();
      this.row(this._ranges[this._ranges.length - 1] ?? null);
    }
  }

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

  protected loopParts(loop: LoopShape): {
    body: ParsedObject[];
    test: readonly ParsedObject[];
  } {
    const body = heldObjectsOf(loop.body);
    const test = branchContent(loop.test);
    this.requireHeld(body, [
      ...test,
      ...loop.objects.flatMap((obj) => obj.content ?? []),
    ]);
    return { body, test };
  }

  protected requireHeld(
    body: readonly ParsedObject[],
    held: readonly ParsedObject[],
  ): void {
    const moved = body.find((obj) => !held.includes(obj));
    if (moved) {
      this.unsupported(moved.typeName);
    }
  }

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

  protected emitWhile(loop: LoopShape): void {
    const [gather, breakGather] = loop.objects as [Gather, Gather];
    const { body, test } = this.loopParts(loop);
    const begin = test[0];
    this.expect(
      gather.content.length === 1 &&
        isConditionalOf(gather.content[0], loop.test) &&
        breakGather.content.length === 0 &&
        !!begin &&
        isBeginScope(begin) &&
        this.matches(test, [begin], body, [isEndScope, isDivert]),
      "a while loop",
    );
    const head = this.here();
    const exit = this.emitTest(loop.test);
    this.emitObject(begin);
    if (inlinedBodies.has(loop.body)) {
      this.emitInlineLoopBody(loop, body, this._scopes - 1, exit, head);
      this.emit(Op.EndScope);
      this.jumpBack(Op.Jump, head);
      this.bind(exit);
      return;
    }
    const k = this.enterBlock(loop.body, BLOCK_LOOP | BLOCK_PASS_SCOPE);
    this.emit(Op.EndScope);
    this.blockResume(k, head);
    this.bind(exit);
    this.blockBreak(k, exit);
  }

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
    const next: ProgramLabel = { offset: -1 };
    this.emitLoopBody(loop, body, exit, next);
    this.bind(next);
    this.emitObject(loop.step!);
    this.jumpBack(Op.Jump, head);
    this.bind(exit);
    this.emitObject(end!);
  }

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
    this.emitLoopBody(loop, body, exit, head);
    if (inlinedBodies.has(loop.body)) {
      this.jumpBack(Op.Jump, head);
    }
    this.bind(exit);
    this.emitObject(end!);
  }

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
    const check: ProgramLabel = { offset: -1 };
    const leave: ProgramLabel = { offset: -1 };
    this.emitLoopBody(loop, body, leave, check);
    this.bind(check);
    const exit = this.emitTest(loop.test);
    this.jumpBack(Op.Jump, head);
    this.bind(exit);
    this.bind(leave);
    this.emitObject(end!);
  }

  protected emitLoopBody(
    loop: LoopShape,
    body: readonly ParsedObject[],
    exit: ProgramLabel,
    next: ProgramLabel,
  ): void {
    if (inlinedBodies.has(loop.body)) {
      this.emitInlineLoopBody(loop, body, this._scopes, exit, next);
      return;
    }
    const k = this.enterBlock(loop.body, BLOCK_LOOP);
    this.blockResume(k, next);
    this.blockBreak(k, exit);
  }

  protected emitInlineLoopBody(
    loop: LoopShape,
    body: readonly ParsedObject[],
    scopes: number,
    exit: ProgramLabel,
    next: ProgramLabel,
  ): void {
    const depth = this._scopes;
    this._inlineLoops.push({ loop, scopes, exit, next });
    this.emitObjects(body);
    this._inlineLoops.pop();
    this.expect(this._scopes === depth, "a loop's body");
  }

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
    let end = range.endLineNumber - 1;
    let endColumn = Math.max(0, range.endCharacterNumber - 1);
    if (endColumn === 0 && end > start) {
      end -= 1;
      if (this._lineEnd) {
        endColumn = this._lineEnd(end);
      } else if (this._blocks.length === 0) {
        const lines = (this._sourceLines ??= this._source.split("\n"));
        const text = lines[end - this._firstLine];
        endColumn =
          end === this._firstLine || text === undefined
            ? 0
            : text.replace(/\r$/, "").length;
      } else {
        endColumn = 0;
      }
    }
    for (const block of this._blocks) {
      const below = block.firstLine > start && block.firstLine <= end;
      const fromFirstLine =
        block.firstLine === start &&
        block.firstLine + block.span - 1 > start &&
        end > start;
      if (below || fromFirstLine) {
        end = below ? block.firstLine - 1 : start;
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
      case Op.VarPtr:
      case Op.CallVar:
      case Op.JumpVar:
      case Op.Tag:
        return JSON.stringify(this.table.strings[arg]);
      case Op.Num:
        return numberText(this.table.numbers[arg]!);
      case Op.Sym:
      case Op.Call:
      case Op.JumpSym:
      case Op.Visit:
      case Op.GetCount:
      case Op.VisitIndex:
      case Op.ShuffleIndex:
        return this.describeSymbol(arg);
      default:
        return String(arg);
    }
  }

  protected describeSymbol(symbol: number): string {
    if (!isAnonymousSymbol(this.table, symbol)) {
      return JSON.stringify(this.table.symbols[symbol]);
    }
    const alternator = this._alternators.indexOf(symbol);
    if (alternator >= 0) {
      return `alternator#${alternator}`;
    }
    const choice = this._choices.indexOf(symbol);
    if (choice >= 0) {
      return `choice#${choice}`;
    }
    const part = this._blocks
      .filter((block) => block.fn)
      .findIndex((block) => block.fn!.symbol === symbol);
    return part >= 0 ? `function#${part}` : "function";
  }

  protected assemble(input: StatementInput): ProgramChunk {
    const code = this._code;
    const rows = this._rows;
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
    const references: number[] = [];
    for (const [symbol, read] of this._references) {
      references.push(symbol, factHash(factsText(read)));
    }
    const exports = this._exports;
    const chunk = new Int32Array(
      HEADER_WORDS +
        code.length +
        rows.length +
        exports.length +
        blocks.length +
        references.length,
    );
    chunk[H_CODE_WORDS] = code.length;
    chunk[H_LINE_ROWS] = rows.length / LINE_ROW_WORDS;
    chunk[H_EXPORT_ROWS] = exports.length / EXPORT_ROW_WORDS;
    chunk[H_BLOCK_ROWS] = blocks.length / BLOCK_ROW_WORDS;
    chunk[H_REFERENCE_ROWS] = references.length / REFERENCE_ROW_WORDS;
    chunk[H_CHUNK_ID] = input.chunkId;
    const fingerprint = hash64(input.fingerprint);
    chunk[H_FINGERPRINT] = fingerprint[0];
    chunk[H_FINGERPRINT + 1] = fingerprint[1];
    const layout = hash64(
      [
        ...this._layout,
        ...exports.flatMap((word, i) =>
          i % EXPORT_ROW_WORDS === 0
            ? [`export:${this.describeSymbol(word)}:${exports[i + 1]}`]
            : [],
        ),
      ].join("\n"),
    );
    chunk[H_LAYOUT_HASH] = layout[0];
    chunk[H_LAYOUT_HASH + 1] = layout[1];
    let at = HEADER_WORDS;
    chunk.set(code, at);
    at += code.length;
    chunk.set(rows, at);
    at += rows.length;
    chunk.set(exports, at);
    at += exports.length;
    chunk.set(blocks, at);
    at += blocks.length;
    chunk.set(references, at);
    return chunk;
  }
}

export const branchContent = (
  branch: ConditionalSingleBranch,
): readonly ParsedObject[] =>
  (branch as unknown as { _innerWeave: { content: ParsedObject[] } | null })
    ._innerWeave?.content ?? [];

const raisesChoice = (obj: ParsedObject): boolean =>
  obj instanceof Choice ||
  ((obj as { isChooseBlock?: boolean }).isChooseBlock !== true &&
    (obj.content ?? []).some(raisesChoice));

const opensChoices = (obj: ParsedObject): boolean => {
  const body = loopOf.get(obj)?.body ?? bodyOfBlock.get(obj);
  return (
    !!body && inlinedBodies.has(body) && heldObjectsOf(body).some(raisesChoice)
  );
};

export const emitTargets = (
  emitter: ProgramEmitter,
  assignment: MultiVariableAssignment,
): void => {
  const targets = assignment.targetAssignments;
  emitter.emit(Op.Unpack, targets.length);
  for (const target of targets) {
    emitter.recordResolution(target.resolutionKey);
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

export const factHash = (facts: string): number => hash64(facts)[1];

export const factsText = (read: ReadonlyMap<string, string>): string => {
  if (read.size === 0) {
    return "";
  }
  return [...read.keys()]
    .sort()
    .map((name) => `${name}=${read.get(name)}`)
    .join("\n");
};

export const NO_FACTS = factHash("");

const numberText = (value: number): string =>
  Object.is(value, -0) ? "-0" : String(value);

export const describeInstruction = (
  chunk: ProgramChunk,
  offset: number,
  table: ProgramTable,
  symbolName?: (symbol: number) => string,
): string => {
  const w0 = chunk[HEADER_WORDS + offset]!;
  const arg = chunk[HEADER_WORDS + offset + 1]!;
  const op = opOf(w0);
  const flags = flagsOf(w0);
  const aux = auxOf(w0);
  const name = OP_NAMES[op] ?? `op${op}`;
  const flagText = flags ? ` flags ${flags}` : "";
  const symbol = (id: number): string => {
    if (!isAnonymousSymbol(table, id)) {
      return JSON.stringify(table.symbols[id]);
    }
    for (let row = 0; row < exportCount(chunk); row += 1) {
      if (exportSymbol(chunk, row) === id) {
        return `function#${row}`;
      }
    }
    return symbolName?.(id) ?? "function";
  };
  switch (op) {
    case Op.Text:
    case Op.Str:
    case Op.Tag:
      return `${name} ${JSON.stringify(table.strings[arg])}`;
    case Op.CallStd:
    case Op.Native:
      return `${name} ${table.strings[arg]}/${aux}${flagText}`;
    case Op.GetVar:
    case Op.SetVar:
    case Op.VarPtr:
      return `${name} ${table.strings[arg]}${flagText}`;
    case Op.CallVar:
      return `${name} ${table.strings[arg]}/${aux}${flagText}`;
    case Op.JumpVar:
      return `${name} ${table.strings[arg]}`;
    case Op.Sym:
    case Op.JumpSym:
    case Op.Visit:
    case Op.GetCount:
    case Op.VisitIndex:
    case Op.ShuffleIndex:
      return `${name} ${symbol(arg)}`;
    case Op.CountOf:
      return `${name}${flagText}`;
    case Op.Thread:
      return `${name} ${offset + 2 + arg}`;
    case Op.Call:
      return `${name} ${symbol(arg)}/${aux}${flagText}`;
    case Op.Num:
      return `${name} ${numberText(table.numbers[arg]!)}${flags ? " float" : ""}`;
    case Op.Int:
    case Op.MakeTable:
    case Op.Pack:
    case Op.Unpack:
    case Op.EnterBlock:
    case Op.DeclareValue:
      return `${name} ${arg}`;
    case Op.Jump:
    case Op.JumpIfFalse:
    case Op.JumpIfKeep:
    case Op.Choice:
      return `${name} ${offset + 2 + arg}${flagText}`;
    case Op.Done:
      return flags & DONE_HOLD ? `${name} hold` : name;
    case Op.CallValue:
      return flags & CALL_METHOD
        ? `${name} ${aux} method ${JSON.stringify(table.strings[arg])}`
        : `${name} ${aux}`;
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
