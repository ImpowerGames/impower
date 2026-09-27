// Loads the engine's modules in the order that settles their import cycle
// (see `CompilationAnnotator`).
import "../inkjs/engine/Container";
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
import type { FlowSource, ProgramFallback, StatementSource } from "./ChunkStore";
import { ROOT_FLOW_NAME, SymbolKind } from "./ProgramSymbols";

/** What the compile knows of one statement: where it stands, its syntax, and
 *  the lowering inputs it recorded. */
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
}

export interface ProgramFlowsInput {
  /** The assembled parsed story of the compile. */
  story: Story;
  /** The script the compile started from, whose top-level content is the
   *  program's top-level flow. */
  uri: string;
  /** The script the compiler seeds the builtins from, whose flows run on the
   *  current engine with the declarations (see `ProgramStory`). */
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
  /** The first placement the build-out has not reached, in program order. */
  fallback?: ProgramFallback;
  /** Every such placement, counted by the construct it names. */
  unsupported: Record<string, number>;
  /** Statements that only declare globals, which the declarations of the
   *  current engine initialize. */
  declarations: number;
  /** Functions, which run on the current engine until they are emitted. */
  functions: number;
}

/**
 * The flows of an assembled parsed story, each as the statements its weave
 * holds, grouped by the compiled block each placed object came from. The top
 * level of the starting script is the flow named by the empty string; a scene
 * or a branch is a flow named by its qualified name.
 *
 * The compiler adds a few objects of its own: the `-> DONE` that ends a flow
 * that does not end itself, and the final gather and `done` of the top level.
 * A sequence that runs out ends its flow as those do, so they are left out.
 * Any other placement the build-out has not reached names a construct: a
 * flow's parameters, top-level content of an included script, and an object
 * no statement placed.
 */
export const programFlows = (input: ProgramFlowsInput): ProgramFlows => {
  const flows: FlowSource[] = [];
  const out: ProgramFlows = {
    flows,
    unsupported: {},
    declarations: 0,
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
        out.declarations += 1;
      } else if (!record) {
        fail("Statement", uri, flowLine);
      } else if (record.uri !== uri) {
        fail("IncludedFile", record.uri, record.line);
      } else {
        statements.push({
          block,
          objects,
          range: record.range,
          firstLine: record.line,
          source: record.source,
          syntax: record.syntax,
          reads: record.reads,
        });
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
            // The builtins script is assembled once and carried, so its
            // declarations may come from an assembly that placed nothing.
            out.declarations += 1;
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
    if (flow.isFunction) {
      out.functions += 1;
      return;
    }
    const header = input.blockOf(flow);
    const record = header ? input.record(header) : undefined;
    const name = prefix + (flow.identifier?.name ?? "");
    if (!record) {
      fail(flow.typeName, input.uri, 0);
      return;
    }
    if (record.uri === input.preludeUri) {
      out.functions += 1;
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
  return out;
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
// (`Story.PreProcessTopLevelObjects`). The top level of every script but the
// starting one holds declarations alone, so nothing is shown before it and
// the newline writes nothing.
const isIncludeNewline = (obj: ParsedObject): boolean =>
  obj instanceof Text && obj.text === "\n";
