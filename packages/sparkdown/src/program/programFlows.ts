// Loads the engine's modules in the order that settles their import cycle
// (see `CompilationAnnotator`).
import "../inkjs/engine/Container";
import type {
  BodyShape,
  StatementReads,
  StatementShape,
} from "../compiler/lower/utils/statementShape";
import { AuthorWarning } from "../inkjs/compiler/Parser/ParsedHierarchy/AuthorWarning";
import { ConstantDeclaration } from "../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { Divert } from "../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import type { FlowBase } from "../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import { Gather } from "../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import type { ParsedObject } from "../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Statement } from "../inkjs/compiler/Parser/ParsedHierarchy/Statement";
import { Stitch } from "../inkjs/compiler/Parser/ParsedHierarchy/Stitch";
import type { Story } from "../inkjs/compiler/Parser/ParsedHierarchy/Story";
import { Text } from "../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableAssignment } from "../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { Weave } from "../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import type { DebugMetadata } from "../inkjs/engine/DebugMetadata";
import type {
  BodySource,
  DeclarationSource,
  DeclaredGlobal,
  FlowSource,
  ProgramFallback,
  StatementSource,
} from "./ChunkStore";
import { ROOT_FLOW_NAME, SymbolKind } from "./ProgramSymbols";

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
  /** The script the compiler seeds the builtins from, whose functions run
   *  on the current engine (see `ProgramStory`). */
  preludeUri?: string;
  /** The compiled block each placed object came from. */
  blockOf(obj: ParsedObject): object | undefined;
  record(block: object): StatementRecord | undefined;
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
  /** The compiled blocks of the program's functions, which run on the
   *  current engine until they are emitted (#698). A compile in which one of
   *  them is new runs the declarations again, since an initializer may call
   *  a function. */
  functionBlocks: object[];
  /** How many functions the program has. */
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
 * The compiler adds a few objects of its own: the `-> DONE` that ends a flow
 * that does not end itself, and the final gather and `done` of the top level.
 * A sequence that runs out ends its flow as those do, so they are left out.
 * Any other placement the build-out has not reached names a construct: a
 * flow's parameters, top-level content of an included script, and an object
 * no statement placed.
 *
 * The global declarations become the declaration statements of their
 * scripts, each holding the globals it declares in the order the story's
 * `global decl` container initializes them (constants first), under the
 * names that container assigns them.
 */
export const programFlows = (input: ProgramFlowsInput): ProgramFlows => {
  const flows: FlowSource[] = [];
  const out: ProgramFlows = {
    flows,
    declarations: [],
    unsupported: {},
    functionBlocks: [],
    functions: 0,
  };
  const fail = (construct: string, uri: string, line: number) => {
    out.fallback ??= { construct, uri, line };
    out.unsupported[construct] = (out.unsupported[construct] ?? 0) + 1;
  };
  const headerLines: { uri: string; line: number }[] = [];

  const statementsOf = (
    content: readonly ParsedObject[],
    uri: string,
    flowLine: number,
  ): StatementSource[] => {
    const statements: StatementSource[] = [];
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
        fail("IncludedFile", record.uri, record.line);
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
            // the script is included.
            visit(obj.content);
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
        objects.push(...(obj instanceof Statement ? obj.content : [obj]));
      });
    };
    visit(content);
    close();
    return statements;
  };

  const visitFlow = (flow: FlowBase, prefix: string) => {
    const header = input.blockOf(flow);
    if (flow.isFunction) {
      out.functions += 1;
      if (header) {
        out.functionBlocks.push(header);
      }
      return;
    }
    const record = header ? input.record(header) : undefined;
    const name = prefix + (flow.identifier?.name ?? "");
    if (!record) {
      fail(flow.typeName, input.uri, 0);
      return;
    }
    if (record.uri === input.preludeUri) {
      out.functions += 1;
      out.functionBlocks.push(header!);
      return;
    }
    if ((flow.args?.length ?? 0) > 0) {
      fail("Argument", record.uri, record.line);
    }
    headerLines.push({ uri: record.uri, line: record.line });
    flows.push({
      name,
      kind: flow instanceof Stitch ? SymbolKind.Branch : SymbolKind.Scene,
      uri: record.uri,
      firstLine: record.line + 1,
      span: 0,
      statements: statementsOf(
        flow._rootWeave?.content ?? [],
        record.uri,
        record.line,
      ),
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
          uri: record.uri,
          globals: [],
        },
      };
      out.declarations.push(current.source);
    }
    // The statement's objects are its globals' initializers, which the
    // store reads the recorded values of.
    (current.source.globals as DeclaredGlobal[]).push({
      name,
      assignment: declaration,
    });
    (current.source.objects as ParsedObject[]).push(declaration.expression);
  }
  return out;
};

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
 *  bodies when it is a block statement. */
const topLevelStatement = (
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
    };
  }
  return statementOf(block, objects, record.range, record.line, shape, record);
};

/** A statement source for a statement with the shape `shape`. */
const statementOf = (
  block: object,
  objects: ParsedObject[],
  range: DebugMetadata | null,
  firstLine: number,
  shape: StatementShape,
  record: StatementRecord,
): StatementSource => {
  const lineAt = record.lineAt!;
  const text = record.text!;
  const bodies: BodySource[] = [];
  let above = firstLine;
  const cuts: { from: number; to: number }[] = [];
  for (const body of shape.bodies) {
    const statements = body.statements.map((nested) =>
      nestedStatement(nested, record),
    );
    const source = bodyOf(body, statements, lineAt, above);
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
    bodies,
    lineEnd: record.lineEnd,
  };
};

/** A statement of a body, from the shape its lowering recorded. Its syntax
 *  is read as a top-level statement's is, from the start of its node with
 *  the line's indentation, so that a statement moved into a body or out of
 *  one keeps its syntax. */
const nestedStatement = (
  shape: StatementShape,
  record: StatementRecord,
): StatementSource => {
  const firstLine = record.lineAt!(firstNonSpace(record.text!, shape));
  const objects = shape.objects.flatMap((obj) =>
    obj instanceof Statement ? obj.content : [obj],
  );
  const range = objects[0]?.ownDebugMetadata ?? null;
  if (shape.bodies.length > 0) {
    return statementOf(shape, objects, range, firstLine, shape, record);
  }
  let source: string | undefined;
  const sourceOf = () => (source ??= record.text!(shape.from, shape.to));
  let syntax: string | undefined;
  return {
    block: shape,
    objects,
    range,
    firstLine,
    source: sourceOf,
    syntax: () =>
      (syntax ??= `${shape.node}\u0000${record.columnAt!(shape.from)}\u0000${sourceOf()}`),
    reads: readsKey(shape.reads),
  };
};

/** A body's source: its statements and its lines. It runs from the line
 *  after the part that heads it to the line before the part after it; a
 *  statement written on the heading part's line, or on the next part's,
 *  widens it to hold the statement. `above` is the line after the owner's
 *  previous body, or the owner's first line. */
const bodyOf = (
  shape: BodyShape,
  statements: StatementSource[],
  lineAt: (offset: number) => number,
  above: number,
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
  return {
    shape,
    statements,
    firstLine: first,
    span: end - first,
    headLines: first - above,
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
 *  to decide whether its statement's lowering read the same. */
export const readsKey = (reads: StatementReads): string =>
  JSON.stringify([
    [...reads.callable].sort(),
    [...reads.defineType].sort(),
    reads.other,
    reads.context,
  ]);

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
// (`Story.PreProcessTopLevelObjects`). The top level of every script but the
// starting one holds declarations alone, so nothing is shown before it and
// the newline writes nothing.
const isIncludeNewline = (obj: ParsedObject): boolean =>
  obj instanceof Text && obj.text === "\n";
