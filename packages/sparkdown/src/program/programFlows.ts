// Loads the engine's modules in the order that settles their import cycle
// (see `CompilationAnnotator`).
import "../inkjs/engine/Container";
import {
  functionOfBody,
  functionShapeOf,
  type BodyShape,
  type FunctionShape,
  type StatementReads,
  type StatementShape,
} from "../compiler/lower/utils/statementShape";
import { AuthorWarning } from "../inkjs/compiler/Parser/ParsedHierarchy/AuthorWarning";
import { ConstantDeclaration } from "../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { Divert } from "../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { DivertTarget } from "../inkjs/compiler/Parser/ParsedHierarchy/Divert/DivertTarget";
import { FlowBase } from "../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import { FunctionCall } from "../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { memoOf } from "../inkjs/compiler/Parser/ParsedHierarchy/MemoizedStatement";
import { Gather } from "../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Knot } from "../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Statement } from "../inkjs/compiler/Parser/ParsedHierarchy/Statement";
import { Stitch } from "../inkjs/compiler/Parser/ParsedHierarchy/Stitch";
import type { Story } from "../inkjs/compiler/Parser/ParsedHierarchy/Story";
import { Text } from "../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableAssignment } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { Weave } from "../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import type { DebugMetadata } from "../runtime/DebugMetadata";
import type {
  BodySource,
  DeclarationSource,
  DeclaredGlobal,
  FlowSource,
  ProgramFallback,
  StatementSource,
} from "./ChunkStore";
import type { ProgramEmitter } from "./ProgramEmitter";
import { parameterKinds } from "./ProgramFacts";
import { Op } from "./ProgramInstructions";
import {
  INCLUDED_FLOW_PREFIX,
  ROOT_FLOW_NAME,
  SymbolKind,
} from "./ProgramSymbols";

/** What the compile knows of one top-level statement: where it stands, its
 *  syntax, the lowering inputs it recorded, and the shape its lowering found
 *  (`StatementShape`), whose offsets count from the statement's start. */
export interface StatementRecord {
  uri: string;
  /** The statement's first line in its script, counting from 0. */
  line: number;
  /** The statement's source text. */
  source: () => string;
  /** The statement's node name, starting column and source text. */
  syntax: () => string;
  reads: string;
  range: DebugMetadata | null;
  /** The shape the statement's lowering recorded. */
  shape?: StatementShape;
  /** The line (counting from 0) and column of an offset relative to the
   *  statement's start. */
  lineAt?: (offset: number) => number;
  columnAt?: (offset: number) => number;
  /** The text between two offsets relative to the statement's start. */
  text?: (from: number, to: number) => string;
  /** The column at which a line of the script ends. */
  lineEnd?: (line: number) => number;
}

export interface ProgramFlowsInput {
  /** The assembled parsed story of the compile. */
  story: Story;
  /** The script the compile started from, whose top-level content is the
   *  program's top-level flow. */
  uri: string;
  /** The script the compiler seeds the builtins from, whose top-level
   *  content holds declarations alone. */
  preludeUri?: string;
  /** The compiled block each placed object came from. */
  blockOf(obj: ParsedObject): object | undefined;
  record(block: object): StatementRecord | undefined;
  /** For an object of an included script's top level (its weave), which the
   *  story places where the script is included: the included script, and
   *  the line and compiled block of the `include` or `run` statement in the
   *  script that includes it. */
  includedAt?(
    obj: ParsedObject,
  ): { uri: string; line: number; block?: object } | undefined;
  /** The keys the caller keeps from one listing to the next for the
   *  statements that end included scripts' content (`includeExit`), by
   *  their syntax, so that those statements keep their chunks across
   *  compiles for as long as the caller lives; without it, they are this
   *  listing's own. */
  includeKeys?: Map<string, object>;
  /** How many lines a script has. */
  lineCount(uri: string): number;
}

/** The program's flows as the chunk store builds them, or the construct
 *  that makes the program fall back. */
export interface ProgramFlows {
  flows: FlowSource[];
  /** The global declarations, one source per run of a declaring statement's
   *  globals, in the order the story initializes them. */
  declarations: DeclarationSource[];
  /** The first placement the build-out has not reached, in program order. */
  fallback?: ProgramFallback;
  /** Every such placement, counted by the construct it names. */
  unsupported: Record<string, number>;
  /** How many functions the program has: the functions declared at the top
   *  level and those written inside statements. */
  functions: number;
}

/**
 * The flows of an assembled parsed story, each as the statements its weave
 * holds, grouped by the compiled block each placed object came from. The top
 * level of the starting script is the flow named by the empty string; a scene
 * or a branch is a flow named by its qualified name. A block statement's
 * statements carry the statements of its bodies, from the shape its lowering
 * recorded.
 *
 * The top-level content of an included script, which the story places where
 * the script is included (`Story.PreProcessTopLevelObjects`), is a flow of
 * its own in that script (`includedFlowName`), which the including flow
 * jumps to where the story places it and which jumps back when it runs out
 * (`IncludeEntry`, `IncludeExit`).
 *
 * The compiler adds a few objects of its own: the `-> DONE` that ends a flow
 * that does not end itself, and the final gather and `done` of the top level.
 * A sequence that runs out ends its flow as those do, so they are left out.
 * Any other placement the build-out has not reached names a construct: an
 * object no statement placed. A scene or a branch that takes parameters
 * starts with the statement that binds them (`flowEntry`).
 *
 * The global declarations become the declaration statements of their
 * scripts, each holding the globals it declares in the order the story's
 * `global decl` container initializes them (constants first), under the
 * names that container assigns them.
 */
export const programFlows = (input: ProgramFlowsInput): ProgramFlows => {
  const flows: FlowSource[] = [];
  // The keys of the statements that end included scripts' content, and of
  // an entry whose `include` statement's block the caller cannot say, by
  // their syntax: the compiler's own, so they live as long as it does, or
  // this listing's alone.
  const includeKeys = input.includeKeys ?? new Map<string, object>();
  const out: ProgramFlows = {
    flows,
    declarations: [],
    unsupported: {},
    functions: 0,
  };
  const fail = (construct: string, uri: string, line: number) => {
    out.fallback ??= { construct, uri, line };
    out.unsupported[construct] = (out.unsupported[construct] ?? 0) + 1;
  };
  const headerLines: { uri: string; line: number }[] = [];
  // The flows of the functions declared at the top level, which span their
  // own definitions.
  const functionFlows: FlowSource[] = [];
  // The flows of the included scripts' top-level content, each with the
  // newlines the story writes where it ends.
  const includedFlows: { flow: FlowSource; newlines: number }[] = [];

  /** The statements of `content`, a flow's weave, written in the script
   *  `uri`, with a statement that runs the content of each script the flow
   *  includes (`include`). */
  const statementsOf = (
    content: readonly ParsedObject[],
    uri: string,
    flowLine: number,
  ): StatementSource[] => {
    const statements: StatementSource[] = [];
    const entries = new Set<StatementSource>();
    let block: object | undefined;
    let objects: ParsedObject[] = [];
    const close = () => {
      if (!block) {
        return;
      }
      const record = input.record(block);
      if (objects.every(isDeclaration)) {
        // A statement that only declares runs nothing where it is written;
        // its globals initialize with the declarations below.
      } else if (!record) {
        fail("Statement", uri, flowLine);
      } else if (record.uri !== uri) {
        // The story keeps each script's top level in a weave of its own
        // (`include` below), so a statement of another script in this list
        // is a placement the listing does not know.
        fail("a statement of another script", record.uri, record.line);
      } else {
        statements.push(topLevelStatement(block, objects, record));
      }
      block = undefined;
      objects = [];
    };
    const visit = (list: readonly ParsedObject[]) => {
      list.forEach((obj, i) => {
        const owner = input.blockOf(obj);
        if (!owner) {
          close();
          if (obj instanceof Weave) {
            // An included script's top level, which the story places where
            // the script is included, followed by the newline it writes
            // where the script's content ends.
            const entry = include(
              obj,
              isIncludeNewline(list[i + 1]) ? 1 : 0,
              flowLine,
            );
            if (entry) {
              statements.push(entry);
              entries.add(entry);
            }
          } else if (isDeclaration(obj)) {
            // A declaration placed by no statement the compile recorded;
            // the declarations below name it if it declares a global.
          } else if (!isCompilerEnding(list, i) && !isIncludeNewline(obj)) {
            fail(obj.typeName, uri, flowLine);
          }
          return;
        }
        if (owner !== block) {
          close();
          block = owner;
        }
        if (obj instanceof Weave && obj.isChooseBlock && obj.assembledFrom) {
          // A `choose` block that ends its chunk: the assembly placed a weave
          // of its own in place of the block's, which goes on to hold the
          // content of the chunks after it, as statements after the block.
          // The block's statement is the weave its chunk lowered.
          objects.push(obj.assembledFrom);
          visit(obj.content.slice(obj.assembledFrom.content.length));
          return;
        }
        objects.push(...(obj instanceof Statement ? obj.content : [obj]));
      });
    };
    visit(content);
    close();
    // The story places the content of the scripts a script includes before
    // its own content, wherever the `include` statements stand, so an entry
    // runs before the statements after it and stands no lower than the
    // first of them, as the line starts of a sequence go.
    for (let i = statements.length - 2; i >= 0; i -= 1) {
      const entry = statements[i]!;
      if (entries.has(entry)) {
        entry.firstLine = Math.min(entry.firstLine, statements[i + 1]!.firstLine);
      }
    }
    return statements;
  };

  /** An included script's top level, `weave`, as the statement of the
   *  including flow that runs it (`IncludeEntry`), on the line of the
   *  `include` statement there, or nothing when it runs nothing. Its
   *  statements are a flow of its own in its script (`includedFlowName`): the
   *  entries of the scripts it includes, whose content the story places
   *  first, and then its own. A script whose top level holds declarations
   *  alone, and includes no script whose top level runs anything, has no
   *  flow, and the newline its end writes, after nothing it showed, is left
   *  out. */
  const include = (
    weave: Weave,
    newlines: number,
    flowLine: number,
  ): StatementSource | undefined => {
    const at = input.includedAt?.(weave);
    const uri = at?.uri ?? scriptOf(weave.content, input);
    if (uri === undefined) {
      return undefined;
    }
    const statements = statementsOf(weave.content, uri, 0);
    if (statements.length === 0) {
      return undefined;
    }
    const name = includedFlowName(uri);
    includedFlows.push({
      flow: {
        name,
        kind: SymbolKind.Root,
        uri,
        firstLine: 0,
        span: 0,
        statements,
      },
      newlines,
    });
    return includeEntry(name, uri, at?.line ?? flowLine, at?.block, includeKeys);
  };

  // A function declared at the top level is a flow of its own, whose one
  // statement is its definition: the chunk binds the parameters and enters
  // the body. So is one written at the top level inside a `do` block, whose
  // content the story takes as its own, with the function among its flows:
  // its definition is the statement of the block's body that writes it. So
  // is the evaluator a UI binding's lowering hoisted to the top level under a
  // name of its own, whose definition is the binding's source. A function a
  // statement creates as a value is a block of that statement's chunk, which
  // the statement's source carries.
  const visitFunction = (flow: FlowBase, header: object | undefined) => {
    out.functions += 1;
    const own = functionShapeOf.get(flow);
    if (own && !own.named && !(flow instanceof Knot)) {
      return;
    }
    const record = header ? input.record(header) : undefined;
    if (own?.named) {
      if (!record || !record.lineAt || !record.text) {
        fail(flow.typeName, record?.uri ?? input.uri, record?.line ?? 0);
        return;
      }
      functionFlows.push(evaluatorFlow(flow, own, record));
      return;
    }
    const shape = record?.shape;
    // The definition at the top level is the statement, whose function the
    // compile builds anew as the story's flow; one inside a block is the
    // statement that writes the flow itself.
    const writer = !shape
      ? undefined
      : shape.bodies.some((b) => functionOfBody.has(b))
        ? shape
        : writerOf(shape, flow);
    if (!header || !record || !writer || !record.lineAt || !record.text) {
      fail(flow.typeName, record?.uri ?? input.uri, record?.line ?? 0);
      return;
    }
    const name = flow.identifier?.name ?? "";
    const nested = writer !== shape;
    const firstLine = nested
      ? record.lineAt(firstNonSpace(record.text, writer))
      : record.line;
    const definition = statementOf(
      nested ? writer : header,
      [],
      nested ? (flow.ownDebugMetadata ?? null) : record.range,
      firstLine,
      writer,
      record,
    );
    definition.defines = name;
    functionFlows.push({
      name,
      kind: SymbolKind.Function,
      uri: record.uri,
      firstLine,
      span: record.lineAt(Math.max(0, writer.to - 1)) + 1 - firstLine,
      statements: [definition],
    });
  };

  const visitFlow = (flow: FlowBase, prefix: string) => {
    const header = input.blockOf(flow);
    if (flow.isFunction) {
      visitFunction(flow, header);
      return;
    }
    const record = header ? input.record(header) : undefined;
    const name = prefix + (flow.identifier?.name ?? "");
    if (!record) {
      fail(flow.typeName, input.uri, 0);
      return;
    }
    if (record.uri === input.preludeUri) {
      fail(flow.typeName, record.uri, record.line);
      return;
    }
    headerLines.push({ uri: record.uri, line: record.line });
    // A scene whose content starts with a branch enters that branch, as the
    // current engine's knot diverts to its first stitch
    // (`FlowBase.GenerateRuntimeObject`): one that takes no parameters by
    // its row in the root, and one that takes some from its entry, after it
    // binds them.
    const first = flow.content?.[0];
    const start =
      flow instanceof Knot &&
      first instanceof FlowBase &&
      !first.isFunction &&
      !first.hasParameters
        ? `${name}.${first.identifier?.name ?? ""}`
        : undefined;
    const statements = statementsOf(
      flow._rootWeave?.content ?? [],
      record.uri,
      record.line,
    );
    if (flow.hasParameters) {
      statements.unshift(
        flowEntry(
          flow,
          name,
          header!,
          record,
          start === undefined ? undefined : { flow: first as FlowBase, name: start },
        ),
      );
    }
    const startsWith = flow.hasParameters ? undefined : start;
    flows.push({
      name,
      kind: flow instanceof Stitch ? SymbolKind.Branch : SymbolKind.Scene,
      uri: record.uri,
      firstLine: record.line + 1,
      span: 0,
      statements,
      params: parameterKinds(flow.args),
      ...(startsWith === undefined ? {} : { startsWith }),
    });
    for (const sub of flow.subFlowsByName.values()) {
      visitFlow(sub, `${name}.`);
    }
  };

  flows.push({
    name: ROOT_FLOW_NAME,
    kind: SymbolKind.Root,
    uri: input.uri,
    firstLine: 0,
    span: 0,
    statements: statementsOf(input.story._rootWeave?.content ?? [], input.uri, 0),
  });
  flows.push(...includedFlows.map((included) => included.flow));
  for (const flow of input.story.subFlowsByName.values()) {
    visitFlow(flow, "");
  }

  // A flow's body runs to the line before the next flow's header in its
  // script, or to the script's end; the top level runs to the first header.
  for (const flow of flows) {
    let end = input.lineCount(flow.uri);
    for (const header of headerLines) {
      if (
        header.uri === flow.uri &&
        header.line >= flow.firstLine &&
        header.line < end
      ) {
        end = header.line;
      }
    }
    flow.span = Math.max(0, end - flow.firstLine);
  }
  // An included script's content ends with the jump back to the flow that
  // includes it, on the line after the content's last, which no line of the
  // content maps to.
  for (const { flow, newlines } of includedFlows) {
    (flow.statements as StatementSource[]).push(
      includeExit(
        flow.name,
        flow.uri,
        flow.firstLine + flow.span,
        newlines,
        includeKeys,
      ),
    );
  }
  flows.push(...functionFlows);

  // The globals the story initializes, in its order and under the names it
  // assigns them (their keys in `variableDeclarations`), each given to the
  // statement that declares it: its own placement's, or for a constant the
  // placement of its `const` statement. A statement's globals that the story
  // initializes one after another are one declaration; a statement whose
  // globals it initializes with another statement's between them (a block
  // that declares a constant, which the story initializes before every
  // variable) is a declaration per run, so that the declarations run in the
  // story's order.
  let current: { block: object; source: DeclarationSource } | undefined;
  const runs = new Map<object, number>();
  for (const [name, declaration] of input.story.variableDeclarations) {
    if (!declaration.isGlobalDeclaration || !declaration.expression) {
      continue;
    }
    // A declaration inside a block's body is placed with the block.
    let placed: ParsedObject | null = declaration.isConstantDeclaration
      ? declaration.expression.parent
      : declaration;
    let block = placed ? input.blockOf(placed) : undefined;
    while (!block && placed?.parent) {
      placed = placed.parent;
      block = input.blockOf(placed);
    }
    const record = block ? input.record(block) : undefined;
    if (!block || !record) {
      fail(declaration.typeName, input.uri, 0);
      continue;
    }
    if (current?.block !== block) {
      // A declaration statement is its whole text, a block statement's
      // bodies included, since a declaration can stand inside a body. A
      // later run of the same statement is known by a key of its own, kept
      // for as long as the statement's block is.
      const run = runs.get(block) ?? 0;
      runs.set(block, run + 1);
      current = {
        block,
        source: {
          block: run === 0 ? block : runKey(block, run),
          objects: [],
          range: record.range,
          firstLine: record.line,
          source: record.source,
          syntax:
            run === 0 ? record.syntax : () => `${record.syntax()}\u0000${run}`,
          reads: record.reads,
          text: record.text,
          uri: record.uri,
          globals: [],
        },
      };
      out.declarations.push(current.source);
    }
    // The statement's objects are its globals' initializers, which the
    // store reads the recorded values of. A function an initializer creates
    // (a `define`'s method, a closure a `store` holds) is a block of the
    // declaration's chunk.
    (current.source.globals as DeclaredGlobal[]).push({
      name,
      assignment: declaration,
    });
    (current.source.objects as ParsedObject[]).push(declaration.expression);
    const bodies = holdsDivertTarget(declaration.expression)
      ? functionBodiesOf([declaration.expression], record)
      : [];
    if (bodies.length > 0) {
      (current.source as { bodies?: BodySource[] }).bodies = [
        ...(current.source.bodies ?? []),
        ...bodies,
      ];
      current.source.lineEnd = record.lineEnd;
    }
  }
  return out;
};

/**
 * The code that binds the parameters of a scene or a branch where the flow
 * is entered (docs/engine/binary-program.md, section 1): a `SetVar` with the
 * declare flag per parameter, last first as a divert pushed the arguments,
 * the `...` with the varargs flag, as the current engine's flow container
 * starts (`FlowBase.GenerateArgumentVariableAssignments`); then, for a scene
 * whose content starts with a branch that takes no parameters, the jump to
 * that branch, as the current engine's knot diverts to its first stitch
 * after it binds.
 */
export class FlowEntry extends ParsedObject {
  constructor(
    readonly flow: FlowBase,
    readonly start?: { flow: FlowBase; name: string },
  ) {
    super();
  }

  override get typeName(): string {
    return "FlowEntry";
  }

  public readonly GenerateRuntimeObject = () => null;

  public override EmitProgram(emitter: ProgramEmitter): void {
    emitter.bindParameters(
      (this.flow.args ?? []).map((arg) => ({
        name: arg.identifier?.name ?? "",
        vararg: !!arg.isVararg,
      })),
    );
    if (this.start) {
      // The jump the entry ends with, which reads nothing of its target as a
      // divert's does. The entry records no resolution: it holds no parsed
      // object whose resolution the store could read again, and its syntax
      // names the target, so a different target is a statement that reads
      // otherwise.
      const symbol = emitter.targetSymbol(this.start.flow, this.start.name);
      emitter.referenceTarget(symbol);
      emitter.emit(Op.JumpSym, symbol);
    }
  }
}

// The key of each flow entry a header has had, by the entry's syntax, so a
// header the compile carried keeps its entry's key while the entry reads the
// same.
const entryKeys = new WeakMap<object, Map<string, object>>();

/** The statement of a scene or a branch that takes parameters which binds
 *  them (`FlowEntry`): the first of the flow's sequence, standing on the
 *  flow's header line, the line before the body's first, so that a jump to
 *  the flow runs it and a jump to a label of the flow, which the label's own
 *  chunk exports, does not. Its syntax is the flow's name, its parameters
 *  and the branch it goes on to, which is everything its code depends on,
 *  so an edit to its parameter list emits it again. */
const flowEntry = (
  flow: FlowBase,
  name: string,
  header: object,
  record: StatementRecord,
  start?: { flow: FlowBase; name: string },
): StatementSource => {
  const params = (flow.args ?? [])
    .map(
      (arg) =>
        `${arg.isByReference ? "ref " : ""}${arg.identifier?.name ?? ""}${arg.isVararg ? "..." : ""}`,
    )
    .join(",");
  const source = `${name}(${params})${start ? ` -> ${start.name}` : ""}`;
  const syntax = `FlowEntry\u0000${source}`;
  let keys = entryKeys.get(header);
  if (!keys) {
    keys = new Map();
    entryKeys.set(header, keys);
  }
  let block = keys.get(syntax);
  if (!block) {
    block = {};
    keys.set(syntax, block);
  }
  return {
    block,
    objects: [new FlowEntry(flow, start)],
    range: null,
    firstLine: record.line,
    source: () => source,
    syntax: () => syntax,
    reads: "",
  };
};

/** The name of the flow of an included script's top-level content: the
 *  script's uri, with each `.` written `%2E`, since a qualified name's
 *  segments are separated by `.`, after `$`, which no name an author writes
 *  holds. */
export const includedFlowName = (uri: string): string =>
  `${INCLUDED_FLOW_PREFIX}${uri.replace(/\./g, "%2E")}`;

/** The name of the label the flow of an included script's content jumps
 *  back to: where the statement that ran it ends (`IncludeEntry`). */
const includeEndName = (flow: string): string => `${flow}$end`;

/**
 * The statement that runs an included script's top-level content where the
 * story places it, at the include (`Story.PreProcessTopLevelObjects`): a
 * `JumpSym` to the flow of that content (`includedFlowName`), then the
 * `Visit` of a label of its own, which the chunk exports, for that flow to
 * jump back to when its content has run (`IncludeExit`). The current engine
 * runs the content in place, in the including flow's frame, so the jumps
 * keep the frame, its temporaries and its call stack as they are. A jump to
 * a label of the content runs on through the rest of it and back, as the
 * content of an include runs everywhere else; the current engine instead
 * ends the story where the content of an included script that holds a label
 * ends, which the program engine does not copy (docs/engine/binary-program.md,
 * What is built). Neither jump reads a fact of its target.
 */
export class IncludeEntry extends ParsedObject {
  constructor(readonly flow: string) {
    super();
  }

  override get typeName(): string {
    return "IncludeEntry";
  }

  public readonly GenerateRuntimeObject = () => null;

  public override EmitProgram(emitter: ProgramEmitter): void {
    const symbol = emitter.targetSymbol(null, this.flow);
    emitter.referenceTarget(symbol);
    emitter.emit(Op.JumpSym, symbol);
    const end = emitter.targetSymbol(null, includeEndName(this.flow));
    emitter.exportHere(end);
    emitter.emit(Op.Visit, end);
  }
}

/** The statement that ends the flow of an included script's top-level
 *  content: the newlines the story writes where the content ends, then the
 *  `JumpSym` back to where the statement that ran it ends (`IncludeEntry`). */
export class IncludeExit extends ParsedObject {
  constructor(
    readonly flow: string,
    readonly newlines: number,
  ) {
    super();
  }

  override get typeName(): string {
    return "IncludeExit";
  }

  public readonly GenerateRuntimeObject = () => null;

  public override EmitProgram(emitter: ProgramEmitter): void {
    for (let n = 0; n < this.newlines; n += 1) {
      emitter.emit(Op.Newline);
    }
    const end = emitter.targetSymbol(null, includeEndName(this.flow));
    emitter.referenceTarget(end);
    emitter.emit(Op.JumpSym, end);
  }
}

// The key of each statement that runs an included script's content
// (`includeEntry`), by the compiled block of the `include` or `run`
// statement it stands for and its syntax, so that it is carried exactly
// while that block is, as a statement of any other block is.
const includeEntryKeys = new WeakMap<object, Map<string, object>>();

const includeStatement = (
  syntax: string,
  source: string,
  firstLine: number,
  obj: ParsedObject,
  keys: Map<string, object>,
): StatementSource => {
  let block = keys.get(syntax);
  if (!block) {
    block = {};
    keys.set(syntax, block);
  }
  return {
    block,
    objects: [obj],
    range: null,
    firstLine,
    source: () => source,
    syntax: () => syntax,
    reads: "",
  };
};

/** The statement of the including flow that runs the included script `uri`'s
 *  top-level content, the flow `flow` (`IncludeEntry`), on the line of the
 *  `include` statement (`statementsOf` keeps it above the statements after
 *  it). It has no line rows. It is known by the compiled block of that
 *  statement (`includeBlock`) and its syntax, so it is carried only while
 *  the incremental parse carried that block, which an edit to the statement
 *  or around it lowers anew: entries of includes written below content of
 *  the script's own all stand on that content's line, so the lines of a
 *  reorder of them, which the compile's changed blocks name, do not say
 *  which entries moved (`ChunkStore.reuseOf`), and the entries of the edited
 *  statements are ones the build aligns anew, by their syntax, which keeps
 *  their chunks. Without the block (a caller that cannot say), the key is
 *  the syntax's alone, in `ownKeys`. */
const includeEntry = (
  flow: string,
  uri: string,
  firstLine: number,
  includeBlock: object | undefined,
  ownKeys: Map<string, object>,
) => {
  let keys = ownKeys;
  if (includeBlock) {
    keys = includeEntryKeys.get(includeBlock) ?? new Map();
    includeEntryKeys.set(includeBlock, keys);
  }
  return includeStatement(
    `IncludeEntry\u0000${flow}`,
    `include ${uri}`,
    firstLine,
    new IncludeEntry(flow),
    keys,
  );
};

/** The last statement of the flow of an included script's top-level content
 *  (`IncludeExit`), on the line after the flow's last, which no line of the
 *  flow maps to, as a flow entry stands on the line before (`flowEntry`). It
 *  has no line rows. It is known by its syntax, which names its flow, which
 *  names the script, in `keys` (`ProgramFlowsInput.includeKeys`, which the
 *  compiler owns): it stands last in that flow whatever else the flow
 *  holds, so it keeps its chunk with nothing read again while it reads the
 *  same (`ChunkStore.keepCarried`). */
const includeExit = (
  flow: string,
  uri: string,
  firstLine: number,
  newlines: number,
  keys: Map<string, object>,
) =>
  includeStatement(
    `IncludeExit\u0000${flow}\u0000${newlines}`,
    `end of include ${uri}\u0000${newlines}`,
    firstLine,
    new IncludeExit(flow, newlines),
    keys,
  );

/** The script whose top level the content of an included weave is: that of
 *  the first object a statement placed there, or nothing when none did. */
const scriptOf = (
  content: readonly ParsedObject[],
  input: ProgramFlowsInput,
): string | undefined => {
  for (const obj of content) {
    const block = input.blockOf(obj);
    const record = block ? input.record(block) : undefined;
    if (record) {
      return record.uri;
    }
  }
  return undefined;
};

/** The flow of a UI binding's evaluator (`FunctionShape.named`): a function
 *  flow named by the evaluator's name, whose one statement defines it, holds
 *  the binding's source and has the evaluator's body as its one body. The
 *  definition is known by the evaluator, which the compile keeps for as long
 *  as it keeps the statement whose lowering built it. A statement of the body
 *  that has no range of its own takes the evaluator's, which is the
 *  binding's. */
const evaluatorFlow = (
  flow: FlowBase,
  own: FunctionShape,
  record: StatementRecord,
): FlowSource => {
  const name = flow.identifier?.name ?? "";
  const lineAt = record.lineAt!;
  const text = record.text!;
  const range = flow.ownDebugMetadata;
  const firstLine = lineAt(own.from);
  const statements = bodyStatements(own.body).map((nested) => {
    const statement = nestedStatement(nested, record);
    return statement.range ? statement : { ...statement, range };
  });
  let source: string | undefined;
  const sourceOf = () => (source ??= text(own.from, own.to));
  let syntax: string | undefined;
  const definition: StatementSource = {
    block: flow,
    objects: [],
    range,
    firstLine,
    source: sourceOf,
    syntax: () =>
      (syntax ??= `${name}\u0000${record.columnAt?.(own.from) ?? 0}\u0000${sourceOf()}`),
    reads: "",
    text,
    bodies: [bodyOf(own.body, statements, lineAt, firstLine, text)],
    lineEnd: record.lineEnd,
    defines: name,
  };
  return {
    name,
    kind: SymbolKind.Function,
    uri: record.uri,
    firstLine,
    span: lineAt(Math.max(own.from, own.to - 1)) + 1 - firstLine,
    statements: [definition],
  };
};

/** The bodies of the functions the objects create as values, with their
 *  statements, for a statement whose own shape does not hold them (a
 *  declaration, whose initializers are the objects). */
const functionBodiesOf = (
  objects: readonly ParsedObject[],
  record: StatementRecord,
): BodySource[] => {
  if (!record.lineAt || !record.text) {
    return [];
  }
  const out: BodySource[] = [];
  const seen = new Set<ParsedObject>();
  const visit = (obj: ParsedObject) => {
    if (obj instanceof DivertTarget) {
      const target = obj.divert.targetContent;
      const fn = target ? functionShapeOf.get(target) : undefined;
      if (target && fn && !seen.has(target)) {
        seen.add(target);
        const statements = bodyStatements(fn.body).map((nested) =>
          nestedStatement(nested, record),
        );
        out.push(
          bodyOf(fn.body, statements, record.lineAt!, record.line, record.text),
        );
      }
    }
    // A call reaches its arguments through `args`, since a call the runtime
    // tree was generated for no longer holds them in `content`.
    const children = obj instanceof FunctionCall ? obj.args : obj.content;
    for (const child of children ?? []) {
      visit(child);
    }
  };
  objects.forEach(visit);
  // In source order, so that each body's lines follow the one above it.
  out.sort((a, b) => a.firstLine - b.firstLine);
  let above = record.line;
  return out.map((body) => {
    const headLines = Math.max(0, body.firstLine - above);
    above = body.firstLine + body.span;
    return { ...body, headLines };
  });
};

/** Whether `obj` holds a divert target at any depth, which a function a
 *  declaration's initializer creates is (`functionBodiesOf`). An object's
 *  syntax never changes once it is lowered, so each is walked once. */
const holdsDivertTarget = (obj: ParsedObject): boolean => {
  let holds = divertTargetHolders.get(obj);
  if (holds === undefined) {
    holds = obj instanceof DivertTarget;
    const children = obj instanceof FunctionCall ? obj.args : obj.content;
    for (const child of children ?? []) {
      holds = holdsDivertTarget(child) || holds;
    }
    divertTargetHolders.set(obj, holds);
  }
  return holds;
};

const divertTargetHolders = new WeakMap<ParsedObject, boolean>();

// The keys of the runs after the first of a statement's declarations.
const runKeys = new WeakMap<object, object[]>();

const runKey = (block: object, run: number): object => {
  let keys = runKeys.get(block);
  if (!keys) {
    keys = [];
    runKeys.set(block, keys);
  }
  return (keys[run - 1] ??= {});
};

/** A statement source for a top-level statement, with the statements of its
 *  bodies when it is a block statement. A block the incremental parse
 *  carried keeps its record (`SparkdownCompiler.statementRecord`), whose
 *  readers read where the block stands now; while it stands on the same line
 *  with the same objects, its source is the one the compile before built,
 *  whose lines are its lines. */
const topLevelStatement = (
  block: object,
  objects: ParsedObject[],
  record: StatementRecord,
): StatementSource => {
  const kept = keptStatements.get(block);
  if (
    kept &&
    kept.record === record &&
    kept.line === record.line &&
    kept.objects.length === objects.length &&
    kept.objects.every((obj, i) => obj === objects[i])
  ) {
    return kept.source;
  }
  const source = statementOfRecord(block, objects, record);
  keptStatements.set(block, { record, line: record.line, objects, source });
  return source;
};

const keptStatements = new WeakMap<
  object,
  {
    record: StatementRecord;
    line: number;
    objects: readonly ParsedObject[];
    source: StatementSource;
  }
>();

const statementOfRecord = (
  block: object,
  objects: ParsedObject[],
  record: StatementRecord,
): StatementSource => {
  const shape = record.shape;
  if (!shape || shape.bodies.length === 0 || !record.lineAt || !record.text) {
    return {
      block,
      objects,
      range: record.range,
      firstLine: record.line,
      source: record.source,
      syntax: record.syntax,
      reads: shape ? readsKey(shape.reads) : record.reads,
      text: record.text,
    };
  }
  return statementOf(block, objects, record.range, record.line, shape, record);
};

/** A statement source for a statement with the shape `shape`. A statement
 *  whose function runs in place (`emitFunctionInPlace`) runs its body as a
 *  block of its own, as it runs a `do` block's. */
const statementOf = (
  block: object,
  objects: ParsedObject[],
  range: DebugMetadata | null,
  firstLine: number,
  shape: StatementShape,
  record: StatementRecord,
  inPlace = false,
): StatementSource => {
  const lineAt = record.lineAt!;
  const text = record.text!;
  const bodies: BodySource[] = [];
  let above = firstLine;
  const cuts: { from: number; to: number }[] = [];
  // In source order: a function written in a loop's condition is lowered
  // before the loop's body, but stands above it.
  const ordered = [...shape.bodies].sort((a, b) => a.headEnd - b.headEnd);
  for (const body of ordered) {
    const statements = bodyStatements(body).map((nested) =>
      nestedStatement(nested, record),
    );
    const source = bodyOf(body, statements, lineAt, above, text, inPlace);
    bodies.push(source);
    above = source.firstLine + source.span;
    cuts.push({ from: lineAt(body.headEnd) + 1, to: lineAt(body.nextStart) });
  }
  // The statement's own source is its text with the lines between the part
  // that heads each body and the part after it left out, so that an edit
  // inside a body leaves it as it was. A line that holds a part keeps what
  // a body writes on it (`if x then n = 1 end`), since the part and the
  // statement's rows, which hold columns, stand beside it.
  let own: string | undefined;
  const ownSource = () =>
    (own ??= cutLines(text(shape.from, shape.to), lineAt(shape.from), cuts));
  let syntax: string | undefined;
  return {
    block,
    objects,
    range,
    firstLine,
    source: ownSource,
    syntax: () =>
      (syntax ??= `${shape.node}\u0000${record.columnAt?.(shape.from) ?? 0}\u0000${ownSource()}`),
    reads: readsKey(shape.reads),
    text: record.text,
    bodies,
    lineEnd: record.lineEnd,
  };
};

/** A statement of a body, from the shape its lowering recorded, without a
 *  flow the story took out of a `do` block it is (`bodyStatements`). Its
 *  syntax is read as a top-level statement's is, from the start of its node
 *  with the line's indentation, so that a statement moved into a body or out
 *  of one keeps its syntax. */
const nestedStatement = (
  shape: StatementShape,
  record: StatementRecord,
): StatementSource => {
  const firstLine = record.lineAt!(firstNonSpace(record.text!, shape));
  const served = shape.objects[0];
  if (served && memoOf(served) && shape.memo && shape.bodies.length > 0) {
    // A block statement served from its memo, with the statements of its
    // bodies, each served too.
    return {
      ...statementOf(shape.memo, [], served.ownDebugMetadata, firstLine, shape, record),
      memo: true,
      stands: [served],
    };
  }
  if (served && memoOf(served) && shape.memo) {
    // A statement served from its memo holds no objects: it keeps the chunk
    // its memo holds, which the store finds by the memo (`ChunkStore`).
    let source: string | undefined;
    const sourceOf = () => (source ??= record.text!(shape.from, shape.to));
    let syntax: string | undefined;
    return {
      block: shape.memo,
      objects: [],
      memo: true,
      stands: [served],
      range: served.ownDebugMetadata,
      firstLine,
      source: sourceOf,
      syntax: () =>
        (syntax ??= `${shape.node}\u0000${record.columnAt!(shape.from)}\u0000${sourceOf()}`),
      reads: readsKey(shape.reads),
      text: record.text,
    };
  }
  const objects = shape.objects
    .flatMap((obj) => (obj instanceof Statement ? obj.content : [obj]))
    .filter((obj) => !isStoryFlow(obj));
  const range = objects[0]?.ownDebugMetadata ?? null;
  if (shape.bodies.length > 0) {
    return statementOf(
      // A block statement the memo remembered is known by its memo, as any
      // statement it remembered is (below).
      shape.memo ?? shape,
      objects,
      range,
      firstLine,
      shape,
      record,
      objects.some((obj) => obj instanceof FlowBase),
    );
  }
  let source: string | undefined;
  const sourceOf = () => (source ??= record.text!(shape.from, shape.to));
  let syntax: string | undefined;
  return {
    // A statement the memo remembered is known by its memo, which a later
    // lowering that serves it hands the store again.
    block: shape.memo ?? shape,
    objects,
    range,
    firstLine,
    source: sourceOf,
    syntax: () =>
      (syntax ??= `${shape.node}\u0000${record.columnAt!(shape.from)}\u0000${sourceOf()}`),
    reads: readsKey(shape.reads),
    text: record.text,
  };
};

/** A body's source: its statements and its lines. It runs from the line
 *  after the part that heads it to the line before the part after it; a
 *  statement written on the heading part's line, or on the next part's,
 *  widens it to hold the statement. `above` is the line after the owner's
 *  previous body, or the owner's first line. A function's body carries the
 *  function, and the function's own source as `text` reads it, unless the
 *  function runs in place (`inPlace`). */
const bodyOf = (
  shape: BodyShape,
  statements: StatementSource[],
  lineAt: (offset: number) => number,
  above: number,
  text?: (from: number, to: number) => string,
  inPlace = false,
): BodySource => {
  let first = lineAt(shape.headEnd) + 1;
  let end = lineAt(shape.nextStart);
  for (const statement of statements) {
    first = Math.min(first, statement.firstLine);
  }
  first = Math.max(first, above);
  const last = statements[statements.length - 1];
  if (last) {
    end = Math.max(end, last.firstLine + 1);
  }
  end = Math.max(end, first);
  const fn = inPlace ? undefined : functionOfBody.get(shape);
  const part = fn ? functionShapeOf.get(fn) : undefined;
  return {
    shape,
    statements,
    firstLine: first,
    span: end - first,
    headLines: first - above,
    fn,
    partSource: part && text ? () => text(part.from, part.to) : undefined,
    headSource: text ? () => text(shape.headStart, shape.headEnd) : undefined,
  };
};

// The offset of a statement's first character that is not a space or tab,
// relative to the top-level statement's start: a node starts with its line's
// indentation.
const firstNonSpace = (
  text: (from: number, to: number) => string,
  shape: StatementShape,
): number => {
  const source = text(shape.from, shape.to);
  const skipped = source.length - source.replace(/^[ \t]+/, "").length;
  return shape.from + skipped;
};

// `text`, whose first line is `firstLine`, with each range of lines in
// `cuts` replaced by one line that stands for a body.
const cutLines = (
  text: string,
  firstLine: number,
  cuts: readonly { from: number; to: number }[],
): string => {
  const lines = text.split("\n");
  const kept: string[] = [];
  lines.forEach((line, i) => {
    const at = firstLine + i;
    const cut = cuts.find((c) => at >= c.from && at < c.to);
    if (!cut) {
      kept.push(line);
    } else if (at === cut.from) {
      kept.push("\u0002");
    }
  });
  return kept.join("\n");
};

/** The recorded reads of a statement as one string, which a chunk compares
 *  to decide whether its statement's lowering read the same. A statement's
 *  reads are recorded once, as it is lowered, and a statement lowered again
 *  records new ones, so the string is made once per statement. */
export const readsKey = (reads: StatementReads): string => {
  let key = readsKeys.get(reads);
  if (key === undefined) {
    key = JSON.stringify([
      [...reads.callable].sort(),
      [...reads.defineType].sort(),
      reads.other,
      reads.context,
      reads.recorded ?? "",
    ]);
    readsKeys.set(reads, key);
  }
  return key;
};

const readsKeys = new WeakMap<StatementReads, string>();

/** The statements of a body that run where the body stands: every statement
 *  its lowering recorded but one that writes a function the story took out
 *  of the block as a flow of its own. The story takes the flows out of its
 *  own content, which a `do` block written at the top level lowers into
 *  (`FlowBase.SplitWeaveAndSubFlowContent`), and a `do` block inside it too;
 *  such a function's definition is a statement of its flow, and the block's
 *  body holds nothing of it. */
export const bodyStatements = (body: BodyShape): StatementShape[] =>
  body.statements.filter(
    (statement) =>
      statement.objects.length === 0 || !statement.objects.every(isStoryFlow),
  );

/** The objects of a body's statements that run where the body stands: those
 *  of `bodyStatements`, without a flow the story took out of a `do` block
 *  those statements hold. */
export const heldObjectsOf = (body: BodyShape): ParsedObject[] =>
  bodyStatements(body).flatMap((statement) =>
    statement.objects.filter((obj) => !isStoryFlow(obj)),
  );

// A flow the story holds among its own.
const isStoryFlow = (obj: ParsedObject): boolean =>
  obj instanceof FlowBase && obj.parent !== null && obj.parent === obj.story;

/** The statement that writes the function `flow`, among the statements of
 *  `shape`'s bodies at any depth. */
const writerOf = (
  shape: StatementShape,
  flow: ParsedObject,
): StatementShape | undefined => {
  for (const body of shape.bodies) {
    for (const statement of body.statements) {
      if (statement.bodies.some((b) => functionOfBody.get(b) === flow)) {
        return statement;
      }
      const writer = writerOf(statement, flow);
      if (writer) {
        return writer;
      }
    }
  }
  return undefined;
};

const isDeclaration = (obj: ParsedObject): boolean =>
  (obj instanceof VariableAssignment && obj.isGlobalDeclaration) ||
  obj instanceof ConstantDeclaration ||
  obj instanceof AuthorWarning;

// The `-> DONE` the compiler ends a flow with, and the final gather and
// `done` it ends the top level with (`FlowBase.SplitWeaveAndSubFlowContent`).
const isCompilerEnding = (
  content: readonly ParsedObject[],
  i: number,
): boolean => {
  const obj = content[i];
  if (obj instanceof Divert && obj.isDone && i === content.length - 1) {
    return true;
  }
  return (
    obj instanceof Gather &&
    i === content.length - 2 &&
    content[i + 1] instanceof Divert &&
    (content[i + 1] as Divert).isDone
  );
};

// The newline the story writes where an included script's content ends
// (`Story.PreProcessTopLevelObjects`), which the end of that content's flow
// writes (`IncludeExit`).
const isIncludeNewline = (obj: ParsedObject | undefined): boolean =>
  obj instanceof Text && obj.text === "\n";
