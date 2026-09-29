import { type SyntaxNode } from "@lezer/common";
import type { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import type { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import type { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import type { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import type { LowerContext } from "../context";

/**
 * A statement as its lowering found it, for the binary program's chunk store
 * (docs/engine/binary-program.md, section 1): a statement is one syntax node
 * that is lowered on its own, at the top level of a flow or inside a block.
 * The store gives each statement a chunk of its own, and a block statement's
 * bodies are sequences of the statements inside them.
 *
 * Shapes are recorded only when the lowering context carries a
 * `statementStack`, which the compilation annotator gives it when statement
 * chunks are on (`CompilationConfig.recordLoweringReads`).
 */
export interface StatementShape {
  /** The syntax node's name; for a statement lowered from several sibling
   *  nodes (an assignment written as an access path and its operation), the
   *  first one's. */
  node: string;
  /** Where the statement's nodes start and end, relative to the start of the
   *  top-level node it was lowered in, which an edit above that node does
   *  not change. */
  from: number;
  to: number;
  /** The parsed objects the statement lowered to, in order. Empty for the
   *  top-level statement, whose objects are the compiled block's content. */
  objects: ParsedObject[];
  /** The bodies of a block statement, in the order it runs them. */
  bodies: BodyShape[];
  /** What the statement's lowering read outside its own syntax, not counting
   *  the statements inside its bodies, which record their own. */
  reads: StatementReads;
}

export interface StatementReads {
  /** The global callable names looked up, with the answers. */
  callable: Map<string, boolean>;
  /** The define type names looked up, with the answers. */
  defineType: Map<string, boolean>;
  /** The other reads (`LoweringRead`), as `kind:value`. */
  other: string[];
  /** The part of the enclosing blocks the lowering read: for a statement in
   *  a loop body, how many scoped blocks stand between it and the loop,
   *  which a `break` or `continue` closes before it leaves. */
  context: string;
}

/**
 * One body of a block statement: an `if` branch, a loop's body, a `do`
 * block. Its statements are the ones `lowerStatements` lowered for it. Where
 * the body stands in the owner's source is given by the parts around it: the
 * end of the part that heads it (a condition and its `then`, a loop header,
 * `else`) and the start of the part after it (the next branch, `end`,
 * `until`). A body's lines are the ones between those parts.
 */
export interface BodyShape {
  statements: StatementShape[];
  /** The end of the part that heads the body, relative to the top-level
   *  node's start. */
  headEnd: number;
  /** The start of the part after the body, relative to the same start. */
  nextStart: number;
}

/**
 * How a loop's lowered objects divide into the loop's own code and its body,
 * which the binary program's writer turns into one chunk whose body is a
 * block (docs/engine/binary-program.md, section 1). The objects are the
 * lowerer's, which the current engine runs as they are.
 */
export interface LoopShape {
  kind: "while" | "for" | "forIn" | "repeat";
  body: BodyShape;
  /** The loop's objects in the order the lowerer placed them. */
  objects: ParsedObject[];
  /** The conditional of each pass: the loop's condition (`while`, `for`),
   *  the end of the iteration (`for ... in`), or `not` the `until`
   *  condition (`repeat`). */
  test: ConditionalSingleBranch;
  /** `for`: the hidden index, stop and step declarations. `for ... in`: the
   *  iterator, state and control declaration, and its `__adjust_iter`. */
  init: ParsedObject[];
  /** `for`: the copy of the hidden index into the loop variable. */
  copy?: VariableAssignment;
  /** `for`: the hidden index's step. */
  step?: VariableAssignment;
  /** `for ... in`: the call of the iterator into the loop variables. */
  call?: MultiVariableAssignment;
  /** `for ... in`: the control's update from the first loop variable. */
  update?: VariableAssignment;
}

/** The body each `if` branch or `do` block runs, by the object that holds
 *  it: the branch, or the `do` block's `BeginScope`. */
export const bodyOfBlock = new WeakMap<ParsedObject, BodyShape>();

/** The loop whose objects start with the key (the loop's first object). */
export const loopOf = new WeakMap<ParsedObject, LoopShape>();

/** Whether a divert is a `break` or a `continue` of the innermost loop. */
export const loopExitOf = new WeakMap<ParsedObject, "break" | "continue">();

const emptyReads = (context: string): StatementReads => ({
  callable: new Map(),
  defineType: new Map(),
  other: [],
  context,
});

/** The shape of a top-level statement, which the compilation annotator puts
 *  at the bottom of the statement stack before lowering the node. */
export const topLevelShape = (node: string, from: number, to: number): StatementShape => ({
  node,
  from: 0,
  to: to - from,
  objects: [],
  bodies: [],
  reads: emptyReads(""),
});

/** The statement whose lowering is running, or nothing when shapes are not
 *  recorded. */
export const currentStatement = (ctx: LowerContext): StatementShape | undefined =>
  ctx.statementStack?.[ctx.statementStack.length - 1];

/** A new body of the running statement, headed by the part that ends at
 *  `headEnd` and followed by the part that starts at `nextStart` (absolute
 *  offsets), or nothing when shapes are not recorded. */
export const openBody = (
  ctx: LowerContext,
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
    headEnd: headEnd - base,
    nextStart: nextStart - base,
  };
  owner.bodies.push(body);
  return body;
};

/** Extends the running statement to `to` (an absolute offset), for a part
 *  of it the grammar parses as a sibling node, such as a `repeat` loop's
 *  `until` line. */
export const extendStatement = (ctx: LowerContext, to: number): void => {
  const owner = currentStatement(ctx);
  if (owner) {
    owner.to = Math.max(owner.to, to - (ctx.chunkFrom ?? 0));
  }
};

/** Records that the running statement's lowering read how many scoped
 *  blocks stand between it and the innermost loop, which a `break` or
 *  `continue` closes before it leaves (`unwind`). */
export const recordLoopDepth = (ctx: LowerContext, unwind: number): void => {
  const statement = currentStatement(ctx);
  if (statement) {
    statement.reads.context = String(unwind);
  }
};

/** Starts recording a statement of `body` lowered from `node`. */
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

/** Ends the statement `openStatement` started, whose last node is `last`
 *  and whose objects are those of `result` from `start` on, and adds it to
 *  `body` when it lowered to anything. */
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
  if (shape.objects.length > 0) {
    body.statements.push(shape);
  }
};
