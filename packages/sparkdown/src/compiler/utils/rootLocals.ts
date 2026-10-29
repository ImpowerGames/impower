import type { SyntaxNode } from "@lezer/common";
import {
  EXPLICIT,
  FLOWS,
  childEndingWith,
  scopeOf,
  statementsOf,
} from "./declarationOnly";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { isExplicitRuleName } from "./explicitRuleNames";
import { nodeNameSet } from "./nodeNameSet";
import {
  VARIABLE_DEFINITION_CONTENT_NAMES,
  VARIABLE_DEFINITION_NAMES,
  assignmentListName,
  valueListAssignmentName,
} from "./variableDefinitionNames";

/** The answer for a name the document declares once in the root frame's own
 *  scope, and for a local of a scene's or a branch's scope in scope where code
 *  is written: the code binds it by name, with no slot. A flow's scope holds
 *  only the flow's own bindings, so a closure built in it captures the one in
 *  scope as Luau's upvalue. */
export const ROOT_ONLY = "only";

/** The answer for any name read inside a block a top-level statement opens
 *  (an `if`, a `do`, a loop): the index does not follow the block's own
 *  bindings, so a function or a closure written there binds its names by
 *  name, as one did before the index, until the converter reads a block's
 *  later statements in the scope of its earlier ones (I-1468). */
export const ROOT_IN_BLOCK = "inBlock";

/** The answer for a name the root frame's own scope declares, none of whose
 *  declarations is in scope where code is written (a scene's `local` read in
 *  another scene, or one declared below the code): the name reads the global,
 *  whatever binding of it the scope holds as the code runs. */
export const ROOT_NONE = "none";

// The statements that hold statements of the root frame's own scope without
// opening a scope of their own: a `choose` block, whose choices' bodies and
// `then` clause declare in the scope around it.
const CHOOSE_BLOCKS = nodeNameSet(["LuauSparkdownChooseBlock"]);
const THEN_CLAUSES = nodeNameSet(["LuauSparkdownChooseThenClause"]);
const CHOICES = nodeNameSet(["Choice"]);
const LOCAL_FUNCTIONS = nodeNameSet(["LuauFunctionDefinition", "LuauFunctionAttributes"]);
// A function's body and a define's method, whose locals are the function's
// and no block's.
const FUNCTION_BODIES = nodeNameSet(["LuauFunctionBody", "LuauMethodDefinition"]);
// What a `for` loop's variables are written as in its header, and what
// ends them.
const ACCESS_PATHS = nodeNameSet(["LuauAccessPath", "LuauSparkdownExplicitAccessPath"]);
const FOR_HEADER_ENDS = nodeNameSet([
  "LuauInKeyword",
  "LuauAssignmentOperation",
  "LuauSparkdownExplicitAssignmentOperation",
]);
// A loop's header, which a `for` loop's variables are written in.
const LOOP_CONDITIONS = nodeNameSet(["LuauForCondition", "LuauSparkdownExplicitLoopCondition"]);

// The blocks a top-level statement opens a scope of its own with, inside
// which every name answers `ROOT_IN_BLOCK`. An `&` line's `for` or `while`
// loop is a `LuauSparkdownExplicitLoop`.
const BLOCKS = nodeNameSet([
  "LuauIfBlock",
  "LuauSparkdownIfBlock",
  "LuauSparkdownExplicitIfBlock",
  "LuauDoBlock",
  "LuauSparkdownDoBlock",
  "LuauSparkdownExplicitDoBlock",
  "LuauForLoop",
  "LuauSparkdownForLoop",
  "LuauWhileLoop",
  "LuauSparkdownWhileLoop",
  "LuauSparkdownExplicitLoop",
  "LuauRepeatLoop",
  "LuauSparkdownRepeatLoop",
  "LuauSparkdownExplicitRepeatLoop",
]);

/** A binding of the root frame's own scope: where its name is written, from
 *  where code reads it (the end of its statement, or a parameter's name) and
 *  up to where (the end of the choice whose body declares it), and the flow
 *  whose body declares it, -1 for the top level. A scene's or a branch's
 *  parameter is one of its flow, marked `parameter`. */
interface RootDeclaration {
  at: number;
  parameter?: boolean;
  visibleFrom: number;
  visibleTo: number;
  flow: number;
}

/** A scene or a branch: where its header starts and its `end` ends, and the
 *  flow its body is written in, -1 for the top level. */
interface Flow {
  from: number;
  to: number;
  parent: number;
}

/**
 * The bindings a document makes at its top level and in the scopes of its
 * scenes and branches, which a closure written there reads as Luau reads an
 * upvalue (I-1374, I-1365). A scene opens a scope of its own, and a branch
 * one nested in its scene's (`flowScopesOf`): a flow's `local`, its
 * `local function` and its parameters are bound in its scope, and a
 * `choose` block's choices declare in the scope around the block. A
 * function written at the top level or a define's method reads none of a
 * flow's, as a Luau function cannot read another function's locals. A
 * block's local (an `if`, a loop, a `do`) is in a scope of its own and is
 * not one of them; nor is a local of a function.
 *
 * A scene's body is written at the top level up to its `end`, so the flows
 * are followed as `topLevelStatements` follows them.
 *
 * A flow's declaration of a name the top level does not declare is
 * `ROOT_ONLY`: the frame holds its binding in the flow's scope, apart from
 * every other flow's. Any other declaration is known by its ordinal among the
 * document's declarations of its name: a name declared once is `ROOT_ONLY`,
 * and the binding of each declaration of a name declared more than once is
 * kept under a slot of its own (`rootSlotName`), which the declarations
 * after it leave in place, as a closure built in the root frame captures a
 * top-level `local` through it. A top-level `local` is a compile error, so
 * only a save of a program an earlier engine ran holds such a binding.
 */
export class RootLocals {
  protected readonly declarations = new Map<string, RootDeclaration[]>();
  protected readonly flows: Flow[] = [];
  // The blocks top-level statements open, in document order, none inside
  // another.
  protected readonly blocks: { from: number; to: number }[] = [];
  // The locals each such block declares, a loop's variables among them, by
  // name, each with the range code reads it in.
  protected readonly blockDeclarations = new Map<string, { from: number; to: number }[]>();

  constructor(top: SyntaxNode, read: (from: number, to: number) => string) {
    const open: number[] = [];
    for (let node = top.firstChild; node; node = node.nextSibling) {
      if (FLOWS.has(node.name)) {
        this.flows.push({
          from: node.from,
          to: Number.POSITIVE_INFINITY,
          parent: open[open.length - 1] ?? -1,
        });
        open.push(this.flows.length - 1);
        const params = getDescendent("LuauFunctionParameters", node);
        for (const param of params ? getDescendents("LuauFunctionParameter", params) : []) {
          this.add(read(param.from, param.to).trim(), {
            at: param.from,
            visibleFrom: param.to,
            visibleTo: Number.POSITIVE_INFINITY,
            flow: this.flows.length - 1,
            parameter: true,
          });
        }
      } else if (node.name === "LuauEndKeyword") {
        const flow = open.pop();
        if (flow !== undefined) this.flows[flow]!.to = node.to;
      } else {
        this.collect(node, open[open.length - 1] ?? -1, Number.POSITIVE_INFINITY, read);
      }
    }
  }

  /**
   * The declaration of `name` a function reads where code at `at` is
   * written: the last one before it at the top level or in a flow whose body
   * holds it, and in the body of a choice only within that body: `ROOT_ONLY`
   * for the document's only declaration of the name, its ordinal (from 1)
   * for one of several, or `ROOT_NONE` for none, where the name reads the
   * global, or the builtin of a stdlib name. "" for a name the document
   * declares nowhere in that scope. `ROOT_IN_BLOCK` for any name when `at`
   * is inside a block a top-level statement opens, before any of these.
   */
  answer(name: string, at: number): string {
    if (this.inBlock(at)) return ROOT_IN_BLOCK;
    return this.answerIgnoringBlocks(name, at);
  }

  /** The declaration `answer` gives for `name` at `at` as though no block a
   *  top-level statement opens held `at`: inside such a block, the local of
   *  the flows around the block that is in scope there, a block's own locals
   *  aside. */
  answerIgnoringBlocks(name: string, at: number): string {
    const list = this.declarations.get(name);
    if (!list) return "";
    // Code reads the locals and parameters of the flow whose body holds it,
    // and in a branch, its scene's parameters, which the scene's entry binds
    // as it falls into the branch; a scene's locals are never in a branch's
    // scope (`flowScopesOf`).
    const around = this.flowsAround(at);
    const [own] = around;
    for (let i = list.length - 1; i >= 0; i--) {
      const declaration = list[i]!;
      if (
        declaration.visibleFrom <= at &&
        at <= declaration.visibleTo &&
        (declaration.flow < 0 ||
          declaration.flow === own ||
          (declaration.parameter === true && around.has(declaration.flow)))
      ) {
        return ordinal(list, i);
      }
    }
    return ROOT_NONE;
  }

  /** What the declaration of `name` written at `at` is known by, as `answer`
   *  gives it, or "" when no declaration of the root frame's scope is
   *  written there. */
  declared(name: string, at: number): string {
    const list = this.declarations.get(name);
    if (!list) return "";
    const i = list.findIndex((declaration) => declaration.at === at);
    if (i < 0) return "";
    return ordinal(list, i);
  }

  /** Whether a local a block a top-level statement opens declares (a
   *  `local`, a `local function` or a `for` loop's variable) is in scope
   *  where code at `at` reads `name`. The converter reads a block's later
   *  statements apart from its earlier ones (I-1468), so a closure there
   *  learns from this that a local, and no global or stdlib entry, takes a
   *  name it reads. An `if` block's local counts through the whole block,
   *  its other arms included. */
  blockLocal(name: string, at: number): boolean {
    return this.blockDeclarations.get(name)?.some(({ from, to }) => from <= at && at <= to) ?? false;
  }

  /** Whether `at` is inside a block a top-level statement opens. */
  protected inBlock(at: number): boolean {
    let lo = 0;
    let hi = this.blocks.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const block = this.blocks[mid]!;
      if (at < block.from) hi = mid - 1;
      else if (at > block.to) lo = mid + 1;
      else return true;
    }
    return false;
  }

  /** The flows whose bodies hold `at`, innermost first. */
  protected flowsAround(at: number): Set<number> {
    const around = new Set<number>();
    let lo = 0;
    let hi = this.flows.length - 1;
    let last = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.flows[mid]!.from <= at) {
        last = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    for (let flow = last; flow >= 0; flow = this.flows[flow]!.parent) {
      if (at <= this.flows[flow]!.to) around.add(flow);
    }
    return around;
  }

  protected add(name: string, declaration: RootDeclaration): void {
    const list = this.declarations.get(name);
    if (list) {
      list.push(declaration);
    } else {
      this.declarations.set(name, [declaration]);
    }
  }

  /** The bindings a statement of the top level, of a flow's body or of a
   *  choice's body declares, read up to `visibleTo`: a `local` declaration's
   *  names, a `local function`'s name, those of the statements a `&` line
   *  marks, and those of the choices of a `choose` block. */
  protected collect(
    node: SyntaxNode,
    flow: number,
    visibleTo: number,
    read: (from: number, to: number) => string,
  ): void {
    if (EXPLICIT.has(node.name)) {
      const content = childEndingWith(node, "_content");
      for (const statement of content ? statementsOf(content) : []) {
        this.collect(statement, flow, visibleTo, read);
      }
      return;
    }
    if (CHOOSE_BLOCKS.has(node.name) || THEN_CLAUSES.has(node.name)) {
      this.collectBodies(node, flow, read);
      return;
    }
    if (BLOCKS.has(node.name)) {
      this.blocks.push({ from: node.from, to: node.to });
      this.collectBlock(node, read);
      return;
    }
    if (LOCAL_FUNCTIONS.has(node.name)) {
      const nameNode = getDescendent("LuauFunctionName", node);
      if (nameNode && scopeOf(node, read) === "local") {
        this.add(read(nameNode.from, nameNode.to).trim(), {
          at: nameNode.from,
          visibleFrom: node.to,
          visibleTo,
          flow,
        });
      }
      return;
    }
    if (!VARIABLE_DEFINITION_NAMES.has(node.name)) return;
    if (scopeOf(node, read) !== "local") return;
    for (const nameNode of declaredNameNodes(node)) {
      this.add(read(nameNode.from, nameNode.to).trim(), {
        at: nameNode.from,
        visibleFrom: node.to,
        visibleTo,
        flow,
      });
    }
  }

  /** The locals `block` declares, read up to its end: a `for` loop's
   *  variables, and those of the statements inside it (`collectBlockPart`). */
  protected collectBlock(block: SyntaxNode, read: (from: number, to: number) => string): void {
    const condition = forCondition(block);
    if (condition) {
      for (const name of forVariables(condition, read)) {
        this.declareInBlock(name, condition.to, block.to);
      }
    }
    this.collectBlockPart(block, block, read);
  }

  protected declareInBlock(name: string, from: number, to: number): void {
    const list = this.blockDeclarations.get(name);
    if (list) list.push({ from, to });
    else this.blockDeclarations.set(name, [{ from, to }]);
  }

  /** The locals the statements inside `node` declare, a part of `block`,
   *  the innermost block that holds them, read up to its end: a `local`'s
   *  names, a `local function`'s name, and a nested block's own. A
   *  function's body declares none of them. */
  protected collectBlockPart(
    node: SyntaxNode,
    block: SyntaxNode,
    read: (from: number, to: number) => string,
  ): void {
    const declare = (name: string, from: number, to: number) => this.declareInBlock(name, from, to);
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (FUNCTION_BODIES.has(child.name)) continue;
      if (BLOCKS.has(child.name)) {
        this.collectBlock(child, read);
        continue;
      }
      if (LOCAL_FUNCTIONS.has(child.name)) {
        const nameNode = getDescendent("LuauFunctionName", child);
        if (nameNode && scopeOf(child, read) === "local") {
          declare(read(nameNode.from, nameNode.to).trim(), nameNode.to, block.to);
        }
        continue;
      }
      if (VARIABLE_DEFINITION_NAMES.has(child.name)) {
        if (scopeOf(child, read) === "local") {
          for (const nameNode of declaredNameNodes(child)) {
            declare(read(nameNode.from, nameNode.to).trim(), child.to, block.to);
          }
        }
        continue;
      }
      this.collectBlockPart(child, block, read);
    }
  }

  /** The bindings the statements of a `choose` block or its `then` clause
   *  declare: those of a choice's body, the statements after it, read up to
   *  the next choice of the block or the block's end, and those written
   *  before the first choice, the block's preamble, through the block's end. */
  protected collectBodies(
    node: SyntaxNode,
    flow: number,
    read: (from: number, to: number) => string,
  ): void {
    const content = childEndingWith(node, "_content");
    if (!content) return;
    let inChoice = false;
    for (let child = content.firstChild; child; child = child.nextSibling) {
      if (CHOICES.has(child.name)) {
        inChoice = true;
        continue;
      }
      let visibleTo = content.to;
      for (let next = inChoice ? child.nextSibling : null; next; next = next.nextSibling) {
        if (CHOICES.has(next.name)) {
          visibleTo = next.from;
          break;
        }
      }
      this.collect(child, flow, visibleTo, read);
    }
  }
}

/** What the declaration `list[i]` of a name is known by (`RootLocals`). */
function ordinal(list: readonly RootDeclaration[], i: number): string {
  return list.length === 1 || (list[i]!.flow >= 0 && list.every(({ flow }) => flow >= 0))
    ? ROOT_ONLY
    : String(i + 1);
}

/** The header of `node` when it is a `for` loop: the condition its content
 *  opens with, after a `for` keyword in its begin. */
function forCondition(node: SyntaxNode): SyntaxNode | null {
  const begin = childEndingWith(node, "_begin");
  if (!begin || !getDescendent("LuauForKeyword", begin)) return null;
  const condition = childEndingWith(node, "_content")?.firstChild;
  return condition && LOOP_CONDITIONS.has(condition.name) ? condition : null;
}

/** The variables a `for` loop's header declares: the access paths of one
 *  variable each it holds before its `in` keyword or its `=` (`i = 1, 3`,
 *  `k, v in t`), their type annotations aside. */
function forVariables(
  condition: SyntaxNode,
  read: (from: number, to: number) => string,
): string[] {
  const names: string[] = [];
  const content = childEndingWith(condition, "_content");
  for (let part = content?.firstChild; part; part = part.nextSibling) {
    if (FOR_HEADER_ENDS.has(part.name)) break;
    if (!ACCESS_PATHS.has(part.name)) continue;
    const variable = getDescendent("LuauVariable", part);
    const path = childEndingWith(part, "_content");
    if (!variable || !path) continue;
    const name = read(variable.from, variable.to);
    // A path of more than its one variable (`a.b`) declares nothing.
    if (read(path.from, path.to).trim() === name) names.push(name);
  }
  return names;
}

/** The name nodes a `local` declaration declares, in order: a value in its
 *  list (`x` in `local a, b = 1, x`) declares nothing. */
function declaredNameNodes(node: SyntaxNode): SyntaxNode[] {
  const names: SyntaxNode[] = [];
  for (let content = node.firstChild; content; content = content.nextSibling) {
    if (!VARIABLE_DEFINITION_CONTENT_NAMES.has(content.name)) continue;
    for (let inner = content.firstChild; inner; inner = inner.nextSibling) {
      if (
        !isExplicitRuleName(inner.name, "LuauVariableAssignment") ||
        valueListAssignmentName(inner)
      ) {
        continue;
      }
      const nameNode = assignmentListName(inner);
      if (nameNode) names.push(nameNode);
    }
  }
  return names;
}
