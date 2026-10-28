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
 *  scope: a function binds its binding there by name (`RootBinding`), with no
 *  slot. A scene of another script that declares the name too shares that
 *  scope, and replaces the binding while it runs (I-1455). */
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
 *  parameter is one of its flow. */
interface RootDeclaration {
  at: number;
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
 * The bindings a document makes in the root frame's own scope, which a
 * function or a closure reads as Luau reads an upvalue (I-1374, I-1365). The
 * top level and the bodies of its scenes and branches share that scope: a
 * scene opens no scope of its own, so its `local` declares in the same scope
 * as the top level's, and replaces a binding of its name there while it runs.
 * A scene's or a branch's parameters are bound there as it is entered, and a
 * `choose` block's choices declare there too. A block's local (an `if`, a
 * loop, a `do`) is in a scope of its own and is not one of them; nor is a
 * local of a function.
 *
 * A scene's body is written at the top level up to its `end`, so the flows
 * are followed as `topLevelStatements` follows them.
 *
 * Each declaration is known by its ordinal among the document's declarations
 * of its name: a name declared once is `ROOT_ONLY`, and the binding of each
 * declaration of a name declared more than once is kept under a slot of its
 * own (`rootSlotName`), which the declarations after it leave in place.
 */
export class RootLocals {
  protected readonly declarations = new Map<string, RootDeclaration[]>();
  protected readonly flows: Flow[] = [];
  // The blocks top-level statements open, in document order, none inside
  // another.
  protected readonly blocks: { from: number; to: number }[] = [];

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
    const around = this.flowsAround(at);
    for (let i = list.length - 1; i >= 0; i--) {
      const declaration = list[i]!;
      if (
        declaration.visibleFrom <= at &&
        at <= declaration.visibleTo &&
        (declaration.flow < 0 || around.has(declaration.flow))
      ) {
        return list.length === 1 ? ROOT_ONLY : String(i + 1);
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
    return list.length === 1 ? ROOT_ONLY : String(i + 1);
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
   *  names, those of the statements a `&` line marks, and those of the
   *  choices of a `choose` block. A `local function` there is a function of
   *  the story, as a `function` is, and binds no local. */
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
