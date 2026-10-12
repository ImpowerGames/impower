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
  /** For a statement of a body, the memo it was remembered in or served
   *  from (`compiler/lower/statementMemo.ts`): the statement is known by it
   *  for as long as the memo serves it. */
  memo?: import("../statementMemo").StatementMemoEntry;
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
  /** For a statement of a body, every read of the lowering context its
   *  lowering made, as the context recorded them (`recordLowering`), which
   *  holds the reads above and every other: a field of the context is
   *  compared from the first time a lowerer reads it, with no list of the
   *  fields kept anywhere (#656). */
  recorded?: string;
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
  /** The start of the part that heads the body (a branch's condition or its
   *  `else`, a loop's header, a choice's line, a `then` clause, a function's
   *  header), relative to the top-level node's start. Its source, up to
   *  `headEnd`, is what the body is aligned by when its statement is emitted
   *  again in place (docs/engine/binary-program.md, section 2). */
  headStart: number;
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
 * lowerer's, which the object engine ran as they are.
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

/**
 * A function the lowering built, as the binary program's writer emits it
 * (docs/engine/binary-program.md, sections 1 and 10): its body is a body of
 * the statement that writes it, entered by the function's entry code, which
 * binds its parameters and declares the locals the lowering hoisted to the
 * top of its body.
 */
export interface FunctionShape {
  /** The function's body. */
  body: BodyShape;
  /** Where the function's own source starts and ends, relative to the start
   *  of the top-level node it was lowered in: its part of the statement that
   *  writes it. */
  from: number;
  to: number;
  /** The `local NAME = nil` declarations the lowering put at the top of the
   *  body for the functions it declares without `local`. */
  hoisted: ParsedObject[];
  /** Set for a function the lowering hoisted to the story's top level under
   *  a name of its own, which no statement writes: a UI binding's evaluator
   *  (`__binding$...`). It is defined by a flow of its own, as a function
   *  declared at the top level is, and its source is the binding's. */
  named?: boolean;
}

/** The body each `if` branch or `do` block runs, by the object that holds
 *  it: the branch, or the `do` block's `BeginScope`. */
export const bodyOfBlock = new WeakMap<ParsedObject, BodyShape>();

/** The function a function body belongs to (a `FlowBase`), and the shape of
 *  each function the lowering built while shapes were recorded. */
export const functionOfBody = new WeakMap<BodyShape, ParsedObject>();
export const functionShapeOf = new WeakMap<ParsedObject, FunctionShape>();

/** The loop whose objects start with the key (the loop's first object). */
export const loopOf = new WeakMap<ParsedObject, LoopShape>();

/** Whether a divert is a `break` or a `continue` of the innermost loop. */
export const loopExitOf = new WeakMap<ParsedObject, "break" | "continue">();

/** How many scoped blocks a `break` or `continue` closes before it leaves
 *  (the `EndScope`s its lowering writes before the divert), by the divert. */
export const loopExitUnwind = new WeakMap<ParsedObject, number>();

/** The bodies of `do` blocks and loops that are not blocks of their
 *  statement but its own code: a `choose` block's preamble raises the
 *  choices they hold (`inlineChoiceBranches`). */
export const inlinedBodies = new WeakSet<BodyShape>();

/** The loop each `break` or `continue` leaves, for a loop whose body is its
 *  statement's own code (`inlinedBodies`), by the divert. The writer jumps
 *  within the chunk for one written in that body, and names one left in a
 *  block of the statement (a choice's body, a `then` clause), which runs
 *  after the loop has ended. */
export const inlineExitOf = new WeakMap<ParsedObject, LoopShape>();

// The labels a loop's lowering made for its own head, step and exits, and the
// diverts to them, which the binary program's writer emits as the loop's
// chunk and never as a label or a jump; and the assignments of its hidden
// temporaries and its variables (`LoopShape.init`, `copy`, `step`, `call`,
// `update`).
const loopInternals = new WeakSet<ParsedObject>();

/** Records `loop`, whose objects start with `first`, and marks `internals`,
 *  the labels and diverts its lowering made for itself, and the assignments
 *  of its hidden temporaries and its variables. The lowering names the
 *  labels and diverts: a divert an author wrote in the loop's header (`-> top`
 *  as a value, or the proxy divert of `READ_COUNT(-> top)`) sits among the
 *  loop's objects too, and stays an author's jump target. */
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
      // An assignment of several names declares each through a target of
      // its own.
      for (const target of (obj as Partial<MultiVariableAssignment>).targetAssignments ?? []) {
        loopInternals.add(target);
      }
    }
  }
};

/** Whether `obj` is a label, or a divert to one, that a loop's lowering made
 *  for itself (`recordLoop`), as opposed to one an author wrote, or an
 *  assignment of its hidden temporaries or its variables, or a target of
 *  one. */
export const isLoopInternal = (obj: ParsedObject): boolean =>
  loopInternals.has(obj);

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

/** A new body of the running statement, headed by the part that runs from
 *  `headStart` to `headEnd` and followed by the part that starts at
 *  `nextStart` (absolute offsets), or nothing when shapes are not recorded. */
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

/** A new body of the running statement for the body of the function the
 *  syntax node `fn` defines, headed by the function's header (its name,
 *  parameters and return type) and followed by its `end`, or nothing when
 *  shapes are not recorded. The function is registered on it with
 *  `closeFunctionBody` once the lowering has built it. */
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

// The nodes of a function's header, which stand before its body.
const HEADER_PARTS: ReadonlySet<string> = new Set([
  "LuauFunctionDeclarationName",
  "LuauAccessPath",
  "LuauFunctionName",
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauGenericsDeclaration",
]);

/** A body for the evaluator a UI binding's lowering hoists to the story's
 *  top level under a name of its own, whose source runs from `from` to `to`
 *  (absolute offsets), or nothing when shapes are not recorded. Its statements
 *  are recorded on it, but it is no body of the statement being lowered: the
 *  evaluator is defined by a flow of its own (`FunctionShape.named`). */
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

/** Registers `flow`, the function the lowering built for the syntax node
 *  `fn`, on the body `openFunctionBody` or `openEvaluatorBody` opened for
 *  it; `named` for an evaluator. */
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

/** Where each alternator's and each choice's own source starts and ends,
 *  relative to the start of the top-level node it was lowered in, as a
 *  function's is (`FunctionShape`): the source its count symbol is aligned by
 *  when its statement is emitted again (docs/engine/binary-program.md,
 *  section 2). A choice's body goes with its count symbol. */
export const alternatorSourceOf = new WeakMap<
  ParsedObject,
  { from: number; to: number }
>();

/** Records the source of `alternator` (or of a choice), the syntax node
 *  `node` spans, when shapes are recorded. */
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

/** Records that the running statement's lowering read the `choose` blocks
 *  around it (`value`): how deep it stands in them and whether it stands in
 *  one's preamble, which decide whether it is a block of its own or offers
 *  its choices with the block around it. A statement whose syntax reads the
 *  same in another such place is lowered to other objects, so its chunk is
 *  kept only while this reads the same. */
export const recordChooseContext = (ctx: LowerContext, value: string): void => {
  currentStatement(ctx)?.reads.other.push(`choose:${value}`);
};

/** The body of each choice of a `choose` block, and the body of its `then`
 *  clause, by the choice or by the clause's gather: blocks of the `choose`
 *  statement (docs/engine/binary-program.md, section 4). */
export const choiceBodyOf = new WeakMap<ParsedObject, BodyShape>();

/** The part of a `choose` statement that heads each of its bodies: the
 *  choice, or the gather of the `then` clause, by which the body keeps its
 *  sequence id when the statement is emitted again. */
export const partOfBody = new WeakMap<BodyShape, ParsedObject>();

/** Records `body` as the body of `part`, a choice or a `then` clause's
 *  gather. */
export const recordChoiceBody = (part: ParsedObject, body: BodyShape): void => {
  choiceBodyOf.set(part, body);
  partOfBody.set(body, part);
};

/**
 * Makes the branches of the conditionals among `objects` that offer choices
 * part of the running statement's own code, which is a `choose` block's: an
 * `if` written before a block's first choice gates the choices it holds, and
 * its branches are relative jumps around their code in the block's chunk
 * (docs/engine/binary-program.md, section 4), not blocks. Each such branch's
 * body is taken out of the statement's bodies. Its statements up to its first
 * choice are the statement's own code: the bodies of those statements (a
 * loop's, a nested `if`'s) become the statement's own, and what their
 * lowering read is the statement's. A choice's line is the statement's own
 * code too, and the statements after it up to the next choice, which the
 * object engine's weave nested in the choice, are the choice's body, a block
 * of the statement as the body of any other choice is.
 *
 * The body of a `do` block or a loop that offers choices is made the
 * statement's own code the same way (#1503), so that a choice is never
 * raised from a body's own chunk, which would not hold its entry
 * (`inlinedBodies`). Inside such a loop's body, a block that leaves the loop
 * by a `break` or `continue` is the statement's code too, and the exit is a
 * jump of the chunk (`inlineExitOf`).
 */
export const inlineChoiceBranches = (
  ctx: LowerContext,
  objects: readonly ParsedObject[],
  holdsChoice: (obj: ParsedObject) => boolean,
  isChoice: (obj: ParsedObject) => boolean,
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
    statements.forEach((statement, i) => {
      // A block statement's objects hold those of its bodies, so a choice
      // written in a `do` block or a loop that this body holds is no choice
      // of this statement's: the block is the statement's own code, and its
      // body, which `visit` makes the statement's code in turn, raises it.
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
        owner.bodies.push(choiceBody);
        recordChoiceBody(choice, choiceBody);
        own(statement);
        return;
      }
      if (choiceBody && !statement.objects.some(isChoice)) {
        choiceBody.statements.push(statement);
        return;
      }
      // A block that holds a choice ends the body of the choice before it,
      // as the next choice does.
      choiceBody = undefined;
      own(statement);
      owner.bodies.push(...statement.bodies);
    });
  };
  const holdsInlineExit = (obj: ParsedObject): boolean =>
    inlineExitOf.has(obj) || (obj.content ?? []).some(holdsInlineExit);
  const objectsOf = (body: BodyShape) =>
    body.statements.flatMap((statement) => statement.objects);
  // Records the loop each `break` and `continue` of `loop` inside `obj`
  // leaves, by the labels the lowering made for the loop, which they divert
  // to.
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
  // A body is made the statement's own code when it offers choices, or when
  // it leaves a loop whose body is (its `break` or `continue` is then a jump
  // of the statement's chunk).
  const inlines = (held: readonly ParsedObject[]) =>
    held.some(holdsChoice) || held.some(holdsInlineExit);
  const branchesSeen = new WeakSet<ParsedObject>();
  const visit = (obj: ParsedObject) => {
    const branches = (obj as { branches?: ParsedObject[] }).branches;
    for (const branch of branches ?? []) {
      branchesSeen.add(branch);
      const body = bodyOfBlock.get(branch);
      // A branch whose body is still the statement's: one inside a choice's
      // body is that body's statement's, which a choice cannot stand in.
      const owned = owner.bodies.some((shape) => shape === body);
      if (body && owned && inlines([branch])) {
        bodyOfBlock.delete(branch);
        hoist(body);
      }
    }
    // A `do` block (by its `BeginScope`) or a loop (by its first object)
    // whose body offers choices: its body is the statement's own code, as
    // an `if` branch's is, so the choices it raises are the statement's and
    // their entries are in its chunk (section 4). A loop's exits are
    // recorded first, so a block inside its body that leaves it is made the
    // statement's code too, and its `break` or `continue` is a jump of the
    // chunk.
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

/** Whether `obj` is an object of a statement of one of `statement`'s bodies,
 *  at any depth. */
const heldInBodies = (statement: StatementShape, obj: ParsedObject): boolean =>
  statement.bodies.some((body) =>
    body.statements.some(
      (inner) =>
        inner.objects.some((part) => part === obj) || heldInBodies(inner, obj),
    ),
  );

/** The label a `break` or `continue` diverts to. */
const exitTargetName = (divert: ParsedObject): string | undefined =>
  (divert as { target?: { dotSeparatedComponents?: string } | null }).target
    ?.dotSeparatedComponents;

/** The single statement of an evaluator's body, `return <expr>`, recorded
 *  on `body` as the statement the syntax nodes `first` to `last` lower to:
 *  `lower` lowers it while the statement is open, so the reads of its
 *  lowering are its own. */
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
 *  `body` when it lowered to anything or defines a function, as a variadic
 *  function nested in another does while its definition lowers to no
 *  object. */
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
