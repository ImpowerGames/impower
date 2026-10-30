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
import { DebugMetadata } from "../runtime/DebugMetadata";
import type {
  BodySource,
  DeclarationSource,
  DeclaredGlobal,
  FlowSource,
  UnsupportedConstructSite,
  StatementSource,
} from "./ChunkStore";
import type { ProgramEmitter } from "./ProgramEmitter";
import { parameterKinds } from "./ProgramFacts";
import { Op } from "./ProgramInstructions";
import { ROOT_FLOW_NAME, SymbolKind } from "./ProgramSymbols";

export interface StatementRecord {
  uri: string;
  line: number;
  source: () => string;
  syntax: () => string;
  reads: string;
  range: DebugMetadata | null;
  shape?: StatementShape;
  lineAt?: (offset: number) => number;
  columnAt?: (offset: number) => number;
  text?: (from: number, to: number) => string;
  fingerprint: () => string;
  fingerprintOf?: (
    from: number,
    to: number,
    cuts?: readonly { from: number; to: number }[],
  ) => string;
  lineEnd?: (line: number) => number;
}

export interface ProgramFlowsInput {
  story: Story;
  uri: string;
  preludeUri?: string;
  topLevelFlow?: boolean;
  blockOf(obj: ParsedObject): object | undefined;
  record(block: object): StatementRecord | undefined;
  lineCount(uri: string): number;
  flowEndLine?(uri: string, header: number): number | undefined;
}

export interface ProgramFlows {
  flows: FlowSource[];
  declarations: DeclarationSource[];
  unsupported?: UnsupportedConstructSite;
  unsupportedCounts: Record<string, number>;
  functions: number;
}

export const programFlows = (input: ProgramFlowsInput): ProgramFlows => {
  const flows: FlowSource[] = [];
  const out: ProgramFlows = {
    flows,
    declarations: [],
    unsupportedCounts: {},
    functions: 0,
  };
  const fail = (construct: string, uri: string, line: number) => {
    out.unsupported ??= { construct, uri, line };
    out.unsupportedCounts[construct] = (out.unsupportedCounts[construct] ?? 0) + 1;
  };
  const headerLines: { uri: string; line: number }[] = [];
  const functionFlows: FlowSource[] = [];
  const writes: DeclarationSource[] = [];

  const statementsOf = (
    content: readonly ParsedObject[],
    uri: string,
    flowLine: number,
    found?: (statement: StatementSource) => void,
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
      } else if (!record) {
        fail("Statement", uri, flowLine);
      } else if (record.uri !== uri) {
        fail("a statement of another script", record.uri, record.line);
      } else {
        const statement = topLevelStatement(block, objects, record);
        if (found) {
          found(statement);
        } else {
          statements.push(statement);
        }
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
            memberWrites(obj);
          } else if (isDeclaration(obj)) {
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
          objects.push(obj.assembledFrom);
          visit(obj.content.slice(obj.assembledFrom.content.length));
          return;
        }
        objects.push(...(obj instanceof Statement ? obj.content : [obj]));
      });
    };
    visit(content);
    close();
    return statements;
  };

  const memberWrites = (weave: Weave) => {
    const uri = scriptOf(weave.content, input);
    if (uri !== undefined) {
      statementsOf(weave.content, uri, 0, (statement) => write(statement, uri));
    }
  };
  const write = (statement: StatementSource, uri: string) => {
    writes.push({ ...statement, block: writeKey(statement.block), uri, globals: [] });
  };

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
    const runsOwn = statements.length > 0;
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
    if (start === undefined) {
      const opensBranch = first instanceof FlowBase && !first.isFunction;
      const end = input.flowEndLine?.(record.uri, record.line);
      statements.push(
        runsOwn
          ? flowEnd(header!, end ?? lineAfter(statements, record.line), false)
          : opensBranch
            ? flowEnd(header!, end ?? record.line, false)
            : flowEnd(header!, end ?? record.line + 1, true),
      );
    }
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

  const rootContent = input.story._rootWeave?.content ?? [];
  const rootStatements = input.topLevelFlow
    ? statementsOf(rootContent, input.uri, 0)
    : statementsOf(rootContent, input.uri, 0, (statement) => write(statement, input.uri));
  flows.push({
    name: ROOT_FLOW_NAME,
    kind: SymbolKind.Root,
    uri: input.uri,
    firstLine: 0,
    span: 0,
    statements: rootStatements,
  });
  for (const flow of input.story.subFlowsByName.values()) {
    visitFlow(flow, "");
  }

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
  flows.push(...functionFlows);

  let current: { block: object; source: DeclarationSource } | undefined;
  const runs = new Map<object, number>();
  for (const [name, declaration] of input.story.variableDeclarations) {
    if (!declaration.isGlobalDeclaration || !declaration.expression) {
      continue;
    }
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
          fingerprint: record.fingerprint,
          syntax:
            run === 0 ? record.syntax : () => `${record.syntax()}\u0000${run}`,
          reads: record.reads,
          fingerprintOf: record.fingerprintOf,
          uri: record.uri,
          globals: [],
        },
      };
      out.declarations.push(current.source);
    }
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
  const globalFunctions = new Set<ParsedObject>();
  for (const declaration of out.declarations) {
    for (const body of declaration.bodies ?? []) {
      if (body.fn) {
        globalFunctions.add(body.fn);
      }
    }
  }
  for (const write of writes) {
    if (write.bodies?.some((body) => body.fn && globalFunctions.has(body.fn))) {
      (write as { bodies?: BodySource[] }).bodies = write.bodies.filter(
        (body) => !body.fn || !globalFunctions.has(body.fn),
      );
    }
  }
  out.declarations.push(...writes);
  return out;
};

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

  protected override Prepare(): boolean {
    return false;
  }

  public override EmitProgram(emitter: ProgramEmitter): void {
    emitter.bindParameters(
      (this.flow.args ?? []).map((arg) => ({
        name: arg.identifier?.name ?? "",
        vararg: !!arg.isVararg,
        rootSlot: arg.rootSlot,
      })),
    );
    if (this.start) {
      const symbol = emitter.targetSymbol(this.start.flow, this.start.name);
      emitter.referenceTarget(symbol);
      emitter.emit(Op.JumpSym, symbol);
    }
  }
}

const entryKeys = new WeakMap<object, Map<string, object>>();

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

export class FlowEnd extends ParsedObject {
  override get typeName(): string {
    return "FlowEnd";
  }

  protected override Prepare(): boolean {
    return false;
  }

  public override EmitProgram(emitter: ProgramEmitter): void {
    emitter.emit(Op.Done);
  }
}

const lineRange = (line: number): DebugMetadata => {
  const range = new DebugMetadata();
  range.startLineNumber = line + 1;
  range.endLineNumber = line + 1;
  range.startCharacterNumber = 1;
  range.endCharacterNumber = 1;
  return range;
};

const lineAfter = (
  statements: readonly StatementSource[],
  header: number,
): number => {
  let last = header;
  for (const statement of statements) {
    last = Math.max(
      last,
      statement.range ? statement.range.endLineNumber - 1 : statement.firstLine,
    );
  }
  return last + 1;
};

const flowEndKeys = new WeakMap<object, Map<string, object>>();

const flowEnd = (
  header: object,
  line: number,
  row: boolean,
): StatementSource => {
  const syntax = `FlowEnd\u0000${row ? "row" : ""}`;
  let keys = flowEndKeys.get(header);
  if (!keys) {
    keys = new Map();
    flowEndKeys.set(header, keys);
  }
  let block = keys.get(syntax);
  if (!block) {
    block = {};
    keys.set(syntax, block);
  }
  return {
    block,
    objects: [new FlowEnd()],
    range: row ? lineRange(line) : null,
    firstLine: line,
    source: () => "end",
    syntax: () => syntax,
    reads: "",
  };
};

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
  let fingerprint: string | undefined;
  let syntax: string | undefined;
  const definition: StatementSource = {
    block: flow,
    objects: [],
    range,
    firstLine,
    source: sourceOf,
    fingerprint: () => (fingerprint ??= record.fingerprintOf!(own.from, own.to)),
    syntax: () =>
      (syntax ??= `${name}\u0000${record.columnAt?.(own.from) ?? 0}\u0000${sourceOf()}`),
    reads: "",
    fingerprintOf: record.fingerprintOf,
    bodies: [bodyOf(own.body, statements, lineAt, firstLine, record.fingerprintOf)],
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
          bodyOf(fn.body, statements, record.lineAt!, record.line, record.fingerprintOf),
        );
      }
    }
    const children = obj instanceof FunctionCall ? obj.args : obj.content;
    for (const child of children ?? []) {
      visit(child);
    }
  };
  objects.forEach(visit);
  out.sort((a, b) => a.firstLine - b.firstLine);
  let above = record.line;
  return out.map((body) => {
    const headLines = Math.max(0, body.firstLine - above);
    above = body.firstLine + body.span;
    return { ...body, headLines };
  });
};

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

const writeKeys = new WeakMap<object, object>();

const writeKey = (block: object): object => {
  let key = writeKeys.get(block);
  if (!key) {
    key = {};
    writeKeys.set(block, key);
  }
  return key;
};

const runKeys = new WeakMap<object, object[]>();

const runKey = (block: object, run: number): object => {
  let keys = runKeys.get(block);
  if (!keys) {
    keys = [];
    runKeys.set(block, keys);
  }
  return (keys[run - 1] ??= {});
};

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
      fingerprint: record.fingerprint,
      syntax: record.syntax,
      reads: shape ? readsKey(shape.reads) : record.reads,
      fingerprintOf: record.fingerprintOf,
    };
  }
  return statementOf(block, objects, record.range, record.line, shape, record);
};

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
  const ordered = [...shape.bodies].sort((a, b) => a.headEnd - b.headEnd);
  for (const body of ordered) {
    const statements = bodyStatements(body).map((nested) =>
      nestedStatement(nested, record),
    );
    const source = bodyOf(body, statements, lineAt, above, record.fingerprintOf, inPlace);
    bodies.push(source);
    above = source.firstLine + source.span;
    cuts.push({ from: lineAt(body.headEnd) + 1, to: lineAt(body.nextStart) });
  }
  let own: string | undefined;
  const ownSource = () =>
    (own ??= cutLines(text(shape.from, shape.to), lineAt(shape.from), cuts));
  let fingerprint: string | undefined;
  let syntax: string | undefined;
  return {
    block,
    objects,
    range,
    firstLine,
    source: ownSource,
    fingerprint: () =>
      (fingerprint ??= record.fingerprintOf!(
        shape.from,
        shape.to,
        cutRanges(text(shape.from, shape.to), shape.from, ordered),
      )),
    syntax: () =>
      (syntax ??= `${shape.node}\u0000${record.columnAt?.(shape.from) ?? 0}\u0000${ownSource()}`),
    reads: readsKey(shape.reads),
    fingerprintOf: record.fingerprintOf,
    bodies,
    lineEnd: record.lineEnd,
  };
};

const nestedStatement = (
  shape: StatementShape,
  record: StatementRecord,
): StatementSource => {
  const firstLine = record.lineAt!(firstNonSpace(record.text!, shape));
  const served = shape.objects[0];
  if (served && memoOf(served) && shape.memo && shape.bodies.length > 0) {
    return {
      ...statementOf(shape.memo, [], served.ownDebugMetadata, firstLine, shape, record),
      memo: true,
      stands: [served],
    };
  }
  if (served && memoOf(served) && shape.memo) {
    let source: string | undefined;
    const sourceOf = () => (source ??= record.text!(shape.from, shape.to));
    let fingerprint: string | undefined;
    let syntax: string | undefined;
    return {
      block: shape.memo,
      objects: [],
      memo: true,
      stands: [served],
      range: served.ownDebugMetadata,
      firstLine,
      source: sourceOf,
      fingerprint: () => (fingerprint ??= record.fingerprintOf!(shape.from, shape.to)),
      syntax: () =>
        (syntax ??= `${shape.node}\u0000${record.columnAt!(shape.from)}\u0000${sourceOf()}`),
      reads: readsKey(shape.reads),
      fingerprintOf: record.fingerprintOf,
    };
  }
  const objects = shape.objects
    .flatMap((obj) => (obj instanceof Statement ? obj.content : [obj]))
    .filter((obj) => !isStoryFlow(obj));
  const range = objects[0]?.ownDebugMetadata ?? null;
  if (shape.bodies.length > 0) {
    return statementOf(
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
  let fingerprint: string | undefined;
  let syntax: string | undefined;
  return {
    block: shape.memo ?? shape,
    objects,
    range,
    firstLine,
    source: sourceOf,
    fingerprint: () => (fingerprint ??= record.fingerprintOf!(shape.from, shape.to)),
    syntax: () =>
      (syntax ??= `${shape.node}\u0000${record.columnAt!(shape.from)}\u0000${sourceOf()}`),
    reads: readsKey(shape.reads),
    fingerprintOf: record.fingerprintOf,
  };
};

const bodyOf = (
  shape: BodyShape,
  statements: StatementSource[],
  lineAt: (offset: number) => number,
  above: number,
  fingerprintOf?: (from: number, to: number) => string,
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
    partFingerprint:
      part && fingerprintOf ? () => fingerprintOf(part.from, part.to) : undefined,
    headFingerprint: fingerprintOf
      ? () => fingerprintOf(shape.headStart, shape.headEnd)
      : undefined,
  };
};

const firstNonSpace = (
  text: (from: number, to: number) => string,
  shape: StatementShape,
): number => {
  const source = text(shape.from, shape.to);
  const skipped = source.length - source.replace(/^[ \t]+/, "").length;
  return shape.from + skipped;
};

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

const cutRanges = (
  text: string,
  from: number,
  bodies: readonly BodyShape[],
): { from: number; to: number }[] => {
  const out: { from: number; to: number }[] = [];
  for (const body of bodies) {
    const eol = text.indexOf("\n", body.headEnd - from);
    if (eol < 0) {
      continue;
    }
    const start = from + eol + 1;
    const end = from + text.lastIndexOf("\n", body.nextStart - from - 1) + 1;
    if (end > start) {
      out.push({ from: start, to: end });
    }
  }
  return out;
};

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

export const bodyStatements = (body: BodyShape): StatementShape[] =>
  body.statements.filter(
    (statement) =>
      statement.objects.length === 0 || !statement.objects.every(isStoryFlow),
  );

export const heldObjectsOf = (body: BodyShape): ParsedObject[] =>
  bodyStatements(body).flatMap((statement) =>
    statement.objects.filter((obj) => !isStoryFlow(obj)),
  );

const isStoryFlow = (obj: ParsedObject): boolean =>
  obj instanceof FlowBase && obj.parent !== null && obj.parent === obj.story;

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

const isIncludeNewline = (obj: ParsedObject | undefined): boolean =>
  obj instanceof Text && obj.text === "\n";
