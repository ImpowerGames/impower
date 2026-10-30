import { type SyntaxNode } from "@lezer/common";
import type { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import type { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import type { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import type { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import type { LowerContext } from "../context";

export interface StatementShape {
  node: string;
  from: number;
  to: number;
  objects: ParsedObject[];
  bodies: BodyShape[];
  reads: StatementReads;
  memo?: import("../statementMemo").StatementMemoEntry;
}

export interface StatementReads {
  callable: Map<string, boolean>;
  defineType: Map<string, boolean>;
  other: string[];
  context: string;
  recorded?: string;
}

export interface BodyShape {
  statements: StatementShape[];
  headStart: number;
  headEnd: number;
  nextStart: number;
}

export interface LoopShape {
  kind: "while" | "for" | "forIn" | "repeat";
  body: BodyShape;
  objects: ParsedObject[];
  test: ConditionalSingleBranch;
  init: ParsedObject[];
  copy?: VariableAssignment;
  step?: VariableAssignment;
  call?: MultiVariableAssignment;
  update?: VariableAssignment;
}

export interface FunctionShape {
  body: BodyShape;
  from: number;
  to: number;
  hoisted: ParsedObject[];
  named?: boolean;
}

export const bodyOfBlock = new WeakMap<ParsedObject, BodyShape>();

export const functionOfBody = new WeakMap<BodyShape, ParsedObject>();
export const functionShapeOf = new WeakMap<ParsedObject, FunctionShape>();

export const loopOf = new WeakMap<ParsedObject, LoopShape>();

export const loopExitOf = new WeakMap<ParsedObject, "break" | "continue">();

export const loopExitUnwind = new WeakMap<ParsedObject, number>();

export const inlinedBodies = new WeakSet<BodyShape>();

export const inlineExitOf = new WeakMap<ParsedObject, LoopShape>();

const loopInternals = new WeakSet<ParsedObject>();

export const recordLoop = (
  first: ParsedObject,
  loop: LoopShape,
  internals: readonly ParsedObject[],
): void => {
  loopOf.set(first, loop);
  for (const obj of [
    ...internals,
    ...loop.init,
    loop.copy,
    loop.step,
    loop.call,
    loop.update,
  ]) {
    if (obj) {
      loopInternals.add(obj);
      for (const target of (obj as Partial<MultiVariableAssignment>).targetAssignments ?? []) {
        loopInternals.add(target);
      }
    }
  }
};

export const isLoopInternal = (obj: ParsedObject): boolean =>
  loopInternals.has(obj);

const emptyReads = (context: string): StatementReads => ({
  callable: new Map(),
  defineType: new Map(),
  other: [],
  context,
});

export const topLevelShape = (node: string, from: number, to: number): StatementShape => ({
  node,
  from: 0,
  to: to - from,
  objects: [],
  bodies: [],
  reads: emptyReads(""),
});

export const currentStatement = (ctx: LowerContext): StatementShape | undefined =>
  ctx.statementStack?.[ctx.statementStack.length - 1];

export const openBody = (
  ctx: LowerContext,
  headStart: number,
  headEnd: number,
  nextStart: number,
): BodyShape | undefined => {
  const owner = currentStatement(ctx);
  if (!owner) {
    return undefined;
  }
  const base = ctx.chunkFrom ?? 0;
  const body: BodyShape = {
    statements: [],
    headStart: Math.min(headStart, headEnd) - base,
    headEnd: headEnd - base,
    nextStart: nextStart - base,
  };
  owner.bodies.push(body);
  return body;
};

export const openFunctionBody = (
  ctx: LowerContext,
  fn: SyntaxNode,
): BodyShape | undefined => {
  if (!currentStatement(ctx)) {
    return undefined;
  }
  let headEnd = fn.from;
  let nextStart = fn.to;
  const content =
    fn.getChild(`${fn.name}_content`) ??
    fn.getChild("LuauFunctionDefinition_content");
  for (let child = content?.firstChild; child; child = child.nextSibling) {
    if (HEADER_PARTS.has(child.name)) {
      headEnd = child.to;
    }
  }
  if (headEnd === fn.from) {
    headEnd = content?.from ?? fn.from;
  }
  for (let child = fn.firstChild; child; child = child.nextSibling) {
    if (child.name.endsWith("_end") && child.from >= headEnd) {
      nextStart = child.from;
    }
  }
  return openBody(ctx, fn.from, headEnd, nextStart);
};

const HEADER_PARTS: ReadonlySet<string> = new Set([
  "LuauFunctionDeclarationName",
  "LuauAccessPath",
  "LuauFunctionName",
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauGenericsDeclaration",
]);

export const openEvaluatorBody = (
  ctx: LowerContext,
  from: number,
  to: number,
): BodyShape | undefined => {
  if (!currentStatement(ctx)) {
    return undefined;
  }
  const base = ctx.chunkFrom ?? 0;
  return {
    statements: [],
    headStart: from - base,
    headEnd: from - base,
    nextStart: to - base,
  };
};

export const closeFunctionBody = (
  ctx: LowerContext,
  body: BodyShape | undefined,
  flow: ParsedObject,
  fn: { from: number; to: number },
  hoisted: ParsedObject[] = [],
  named = false,
): void => {
  if (!body) {
    return;
  }
  const base = ctx.chunkFrom ?? 0;
  functionOfBody.set(body, flow);
  functionShapeOf.set(flow, {
    body,
    from: fn.from - base,
    to: fn.to - base,
    hoisted,
    ...(named ? { named } : {}),
  });
};

export const alternatorSourceOf = new WeakMap<
  ParsedObject,
  { from: number; to: number }
>();

export const recordAlternatorSource = (
  ctx: LowerContext,
  alternator: ParsedObject,
  node: { from: number; to: number },
): void => {
  if (!currentStatement(ctx)) {
    return;
  }
  const base = ctx.chunkFrom ?? 0;
  alternatorSourceOf.set(alternator, { from: node.from - base, to: node.to - base });
};

export const recordChooseContext = (ctx: LowerContext, value: string): void => {
  currentStatement(ctx)?.reads.other.push(`choose:${value}`);
};

export const choiceBodyOf = new WeakMap<ParsedObject, BodyShape>();

export const partOfBody = new WeakMap<BodyShape, ParsedObject>();

export const recordChoiceBody = (part: ParsedObject, body: BodyShape): void => {
  choiceBodyOf.set(part, body);
  partOfBody.set(body, part);
};

export const inlineChoiceBranches = (
  ctx: LowerContext,
  objects: readonly ParsedObject[],
  holdsChoice: (obj: ParsedObject) => boolean,
  isChoice: (obj: ParsedObject) => boolean,
  isLabel: (obj: ParsedObject) => boolean,
): void => {
  const owner = currentStatement(ctx);
  if (!owner) {
    return;
  }
  const own = (statement: StatementShape) => {
    for (const [name, found] of statement.reads.callable) {
      owner.reads.callable.set(name, found);
    }
    for (const [name, found] of statement.reads.defineType) {
      owner.reads.defineType.set(name, found);
    }
    owner.reads.other.push(...statement.reads.other);
  };
  const hoist = (body: BodyShape) => {
    const at = owner.bodies.findIndex((shape) => shape === body);
    owner.bodies.splice(at, 1);
    const statements = body.statements;
    let choiceBody: BodyShape | undefined;
    let choiceFollows = false;
    statements.forEach((statement, i) => {
      const choice = statement.objects.find(
        (obj) => isChoice(obj) && !heldInBodies(statement, obj),
      );
      if (choice) {
        let next = i + 1;
        while (
          next < statements.length &&
          !statements[next]!.objects.some(isChoice)
        ) {
          next += 1;
        }
        choiceBody = {
          statements: [],
          headStart: statement.from,
          headEnd: statement.to,
          nextStart: statements[next]?.from ?? body.nextStart,
        };
        choiceFollows = next < statements.length;
        owner.bodies.push(choiceBody);
        recordChoiceBody(choice, choiceBody);
        own(statement);
        return;
      }
      if (choiceBody && !statement.objects.some(isChoice)) {
        choiceBody.statements.push(statement);
        if (choiceFollows && statement.objects.some(isLabel)) {
          owner.reads.other.push("choose:a label between gated choices");
        }
        return;
      }
      choiceBody = undefined;
      own(statement);
      owner.bodies.push(...statement.bodies);
    });
  };
  const holdsInlineExit = (obj: ParsedObject): boolean =>
    inlineExitOf.has(obj) || (obj.content ?? []).some(holdsInlineExit);
  const objectsOf = (body: BodyShape) =>
    body.statements.flatMap((statement) => statement.objects);
  const recordExits = (loop: LoopShape, obj: ParsedObject): void => {
    const labels = new Set<string>();
    for (const label of loop.objects) {
      const name = (label as { name?: unknown }).name;
      if (isLoopInternal(label) && typeof name === "string") {
        labels.add(name);
      }
    }
    const walk = (part: ParsedObject): void => {
      const name = loopExitOf.has(part) ? exitTargetName(part) : undefined;
      if (name !== undefined && labels.has(name)) {
        inlineExitOf.set(part, loop);
      }
      (part.content ?? []).forEach(walk);
    };
    walk(obj);
  };
  const inlines = (held: readonly ParsedObject[]) =>
    held.some(holdsChoice) || held.some(holdsInlineExit);
  const branchesSeen = new WeakSet<ParsedObject>();
  const visit = (obj: ParsedObject) => {
    const branches = (obj as { branches?: ParsedObject[] }).branches;
    for (const branch of branches ?? []) {
      branchesSeen.add(branch);
      const body = bodyOfBlock.get(branch);
      const owned = owner.bodies.some((shape) => shape === body);
      if (body && owned && inlines([branch])) {
        bodyOfBlock.delete(branch);
        hoist(body);
      }
    }
    const loop = loopOf.get(obj);
    const body =
      loop?.body ?? (branchesSeen.has(obj) ? undefined : bodyOfBlock.get(obj));
    if (
      body &&
      owner.bodies.some((shape) => shape === body) &&
      inlines(objectsOf(body))
    ) {
      if (loop) {
        objectsOf(body).forEach((part) => recordExits(loop, part));
      }
      inlinedBodies.add(body);
      hoist(body);
    }
    for (const child of obj.content ?? []) {
      visit(child);
    }
  };
  objects.forEach(visit);
};

const heldInBodies = (statement: StatementShape, obj: ParsedObject): boolean =>
  statement.bodies.some((body) =>
    body.statements.some(
      (inner) =>
        inner.objects.some((part) => part === obj) || heldInBodies(inner, obj),
    ),
  );

const exitTargetName = (divert: ParsedObject): string | undefined =>
  (divert as { target?: { dotSeparatedComponents?: string } | null }).target
    ?.dotSeparatedComponents;

export const lowerEvaluatorStatement = <T extends ParsedObject>(
  ctx: LowerContext,
  body: BodyShape | undefined,
  first: SyntaxNode,
  last: SyntaxNode,
  lower: () => T[],
): T[] => {
  const shape = body ? openStatement(ctx, first) : undefined;
  const content = lower();
  if (shape && body) {
    closeStatement(ctx, shape, body, last, content, 0);
  }
  return content;
};

export const extendStatement = (ctx: LowerContext, to: number): void => {
  const owner = currentStatement(ctx);
  if (owner) {
    owner.to = Math.max(owner.to, to - (ctx.chunkFrom ?? 0));
  }
};

export const recordLoopDepth = (ctx: LowerContext, unwind: number): void => {
  const statement = currentStatement(ctx);
  if (statement) {
    statement.reads.context = String(unwind);
  }
};

export const openStatement = (
  ctx: LowerContext,
  node: SyntaxNode,
): StatementShape => {
  const base = ctx.chunkFrom ?? 0;
  const shape: StatementShape = {
    node: node.name,
    from: node.from - base,
    to: node.to - base,
    objects: [],
    bodies: [],
    reads: emptyReads(""),
  };
  ctx.statementStack!.push(shape);
  return shape;
};

export const closeStatement = (
  ctx: LowerContext,
  shape: StatementShape,
  body: BodyShape,
  last: SyntaxNode,
  result: readonly ParsedObject[],
  start: number,
): void => {
  const stack = ctx.statementStack!;
  if (stack[stack.length - 1] === shape) {
    stack.pop();
  }
  shape.to = Math.max(shape.to, last.to - (ctx.chunkFrom ?? 0));
  shape.objects = result.slice(start);
  if (
    shape.objects.length > 0 ||
    shape.bodies.some((inner) => functionOfBody.has(inner))
  ) {
    body.statements.push(shape);
  }
};
